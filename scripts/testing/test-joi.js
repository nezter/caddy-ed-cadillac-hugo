const Joi = require('joi');

// Test basic Joi schema
const testSchema = Joi.object({
  action: Joi.string().required(),
  limit: Joi.number().integer().min(1).max(100)
});

console.log('Joi schema test:', testSchema.validate({action: 'list', limit: 5}));