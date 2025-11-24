module.exports = function checkRole(required) {
  return async (req, reply) => {
    if (req.user.role !== required) {
      return reply.code(403).send({ error: "Forbidden: insufficient role" });
    }
  };
};
