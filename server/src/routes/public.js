const express = require('express');
const { HttpError, wrap } = require('../middleware/errors');
const results = require('../services/results');
const submissions = require('../services/submissions');
const { aiAvailable } = require('../services/extraction');
const { PARTIES } = require('../config/elections');

// No login needed. Only APPROVED results are ever shown.
module.exports = function publicRoutes(ctx) {
  const router = express.Router();

  router.get('/config', wrap((req, res) => {
    res.json({ demoMode: ctx.config.demoMode, parties: PARTIES, aiAvailable: aiAvailable(ctx.config), maxImageMb: ctx.config.maxImageMb });
  }));

  router.get('/results', wrap((req, res) => {
    res.set('Cache-Control', 'public, max-age=15');
    res.json(results.getArea(ctx.db, req.query));
  }));

  router.get('/units/:code', wrap((req, res) => {
    res.set('Cache-Control', 'public, max-age=15');
    res.json(results.getUnit(ctx.db, String(req.params.code).slice(0, 30)));
  }));

  router.get('/units/:code/image', wrap((req, res) => {
    const unit = results.getUnit(ctx.db, String(req.params.code).slice(0, 30));
    if (!unit.approved) throw new HttpError(404, 'not_found', 'Not found');
    const img = submissions.imageFor(ctx, unit.submissionId, { onlyApproved: true });
    res.set('Content-Type', img.mime);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(img.buffer);
  }));

  return router;
};
