function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'לא מחוברת' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'גישה זו למנהלת בלבד' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
