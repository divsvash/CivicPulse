const express = require('express');
const router  = express.Router();
const cc      = require('../controllers/complaintController');
const { authenticate, authorize } = require('../middleware/auth');
const upload  = require('../middleware/upload');

router.get('/track/:id',        cc.getPublic);
router.post('/',                authenticate, upload.single('image'), cc.create);
router.get('/my',               authenticate, authorize('citizen'), cc.getMy);
router.post('/:id/feedback',    authenticate, authorize('citizen'), cc.submitFeedback);
router.get('/assigned',         authenticate, authorize('officer','admin'), cc.getAssigned);
router.put('/:id/status',       authenticate, authorize('officer','admin'), cc.updateStatus);
router.get('/',                 authenticate, authorize('admin','officer'), cc.getAll);
router.put('/:id/assign',       authenticate, authorize('admin'), cc.assign);
router.delete('/:id',           authenticate, authorize('admin'), cc.remove);
router.get('/:id',              authenticate, cc.getOne);

module.exports = router;