const express = require('express');
const { HttpError, wrap } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth-postgres');
const submissions = require('../services/submissions-postgres');
const audit = require('../services/audit-postgres');

const toId = (v) => {
  const n = Number(v);

  if (!Number.isSafeInteger(n) || n < 1) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  return n;
};

module.exports = function adminRoutes(ctx) {
  const router = express.Router();

  router.use(requireAuth(ctx, 'admin'));
  router.use(express.json({ limit: '16kb' }));

  router.get('/stats', wrap(async (req, res) => {
    res.json(await submissions.stats(ctx));
  }));

  router.get('/submissions', wrap(async (req, res) => {
    res.json(
      await submissions.listForAdmin(ctx, {
        status: req.query.status || 'pending',
        page: req.query.page,
        pageSize: req.query.pageSize
      })
    );
  }));

  router.get('/submissions/:id', wrap(async (req, res) => {
    res.json(
      await submissions.getAdmin(ctx, toId(req.params.id))
    );
  }));

  router.get('/submissions/:id/image', wrap(async (req, res) => {
    const img = await submissions.imageFor(
      ctx,
      toId(req.params.id)
    );

    res.set('Content-Type', img.mime);
    res.set('Cache-Control', 'private, max-age=60');
    res.send(img.buffer);
  }));

  router.post('/submissions/:id/approve', wrap(async (req, res) => {
    res.json(
      await submissions.approve(
        ctx,
        req.user,
        toId(req.params.id),
        req.ip
      )
    );
  }));

  router.post('/submissions/:id/reject', wrap(async (req, res) => {
    res.json(
      await submissions.reject(
        ctx,
        req.user,
        toId(req.params.id),
        (req.body || {}).reason,
        req.ip
      )
    );
  }));

  router.get('/audit', wrap(async (req, res) => {
    res.json({
      items: await audit.recent(ctx.db, req.query.limit)
    });
  }));

  return router;
};
