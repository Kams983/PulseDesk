const { z } = require('zod');

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

module.exports = { loginSchema };
