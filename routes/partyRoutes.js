const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/partyController');

router.post('/',              auth, ctrl.createParty);
router.get('/me',             auth, ctrl.getMyParties);
router.get('/:code',          auth, ctrl.getPartyByCode);
router.post('/:code/join',    auth, ctrl.joinParty);
router.delete('/:code',       auth, ctrl.endParty);

module.exports = router;