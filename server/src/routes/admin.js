const express = require('express');
const { HttpError, wrap } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');
const submissions = require('../services/submissions');
const audit = require('../services/audit');

const toId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'not_found', 'Not found');
  return n;
};

// The admin can look, approve or reject. There is deliberately NO route that edits numbers.
module.exports = function adminRoutes(ctx) {
  const router = express.Router();
  router.use(requireAuth(ctx, 'admin'));
  router.use(express.json({ limit: '16kb' }));

  router.get('/stats', wrap((req, res) => res.json(submissions.stats(ctx))));

  router.get('/submissions', wrap((req, res) => {
    res.json(submissions.listForAdmin(ctx, { status: req.query.status || 'pending', page: req.query.page, pageSize: req.query.pageSize }));
  }));

  router.get('/submissions/:id', wrap((req, res) => res.json(submissions.getAdmin(ctx, toId(req.params.id)))));

  router.get('/submissions/:id/image', wrap((req, res) => {
    const img = submissions.imageFor(ctx, toId(req.params.id));
    res.set('Content-Type', img.mime);
    res.set('Cache-Control', 'private, max-age=60');
    res.send(img.buffer);
  }));

  router.post('/submissions/:id/approve', wrap((req, res) => {
    res.json(submissions.approve(ctx, req.user, toId(req.params.id), req.ip));
  }));

  router.post('/submissions/:id/reject', wrap((req, res) => {
    res.json(submissions.reject(ctx, req.user, toId(req.params.id), (req.body || {}).reason, req.ip));
  }));

  router.get('/audit', wrap((req, res) => res.json({ items: audit.recent(ctx.db, req.query.limit) })));

  return router;
};
