const express = require('express');
const router  = express.Router();
const ac      = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');
const guard   = [authenticate, authorize('admin','officer')];

router.get('/overview',         ...guard, ac.getOverview);
router.get('/monthly-trend',    ...guard, ac.getMonthlyTrend);
router.get('/by-category',      ...guard, ac.getByCategory);
router.get('/heatmap',          ...guard, ac.getHeatmap);
router.get('/leaderboard',      ...guard, ac.getLeaderboard);
router.get('/sla-violations',   ...guard, ac.getSLAViolations);
router.get('/predictive',       ...guard, ac.getPredictiveInsights);

module.exports = router;