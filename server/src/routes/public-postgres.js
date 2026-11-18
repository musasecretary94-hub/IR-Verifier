const express = require('express');
const { HttpError, wrap } = require('../middleware/errors');
const results = require('../services/results-postgres');
const submissions = require('../services/submissions-postgres');
const { aiAvailable } = require('../services/extraction');
const { PARTIES } = require('../config/elections');

module.exports = function publicRoutes(ctx) {
  const router = express.Router();

  router.get('/config', wrap((req, res) => {
    res.json({
      demoMode: ctx.config.demoMode,
      parties: PARTIES,
      aiAvailable: aiAvailable(ctx.config),
      maxImageMb: ctx.config.maxImageMb
    });
  }));

  router.get('/results', wrap(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=15');
    res.json(await results.getArea(ctx.db, req.query));
  }));

  router.get('/units/:code', wrap(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=15');
    res.json(await results.getUnit(
      ctx.db,
      String(req.params.code).slice(0, 30)
    ));
  }));

  router.get('/units/:code/image', wrap(async (req, res) => {
    const unit = await results.getUnit(
      ctx.db,
      String(req.params.code).slice(0, 30)
    );

    if (!unit.approved) {
      throw new HttpError(404, 'not_found', 'Not found');
    }

    const img = await submissions.imageFor(
      ctx,
      unit.submissionId,
      { onlyApproved: true }
    );

    res.set('Content-Type', img.mime);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(img.buffer);
  }));

  return router;
};
