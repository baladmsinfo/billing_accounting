module.exports = function checkRole(required) {
  return async (req, reply) => {
    if (req.role !== required) {
      return reply.code(403).send({ error: "Forbidden: insufficient role" });
    }
  };
};
