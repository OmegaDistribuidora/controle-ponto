const jwt = require("jsonwebtoken");
const { config } = require("./config");

const signToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      role: user.role,
      cpf: user.cpf,
      name: user.name
    },
    config.jwtSecret,
    { expiresIn: "12h" }
  );

const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

module.exports = { signToken, verifyToken };
