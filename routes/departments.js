const express = require('express');
const router  = express.Router();
const dc      = require('../controllers/miscControllers');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/',                 dc.getAll);
router.get('/:id',              dc.getOne);
router.get('/:id/officers',     authenticate, authorize('admin'), dc.getOfficers);
router.post('/',                authenticate, authorize('admin'), dc.create);
router.put('/:id',              authenticate, authorize('admin'), dc.update);
router.delete('/:id',           authenticate, authorize('admin'), dc.remove);

module.exports = router;
