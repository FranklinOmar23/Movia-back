const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MOVIA API',
      version: '1.0.0',
      description: 'Documentación Swagger para la API de MOVIA',
    },
    servers: [
      {
        url: process.env.API_URL || 'https://maroon-goshawk-691607.hostingersite.com',
        description: process.env.NODE_ENV === 'production' ? 'Producción' : 'Local'
      },
      {
        url: 'http://localhost:3000',
        description: 'Desarrollo local'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              example: 'password123',
            },
          },
        },
        CreateUserRequest: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', example: 'Usuario Movia' },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', example: 'password123' },
          },
        },
        UserResponse: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Usuario Movia' },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
          },
        },
        CheckoutSessionResponse: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri', example: 'https://checkout.stripe.com/pay/cs_test_123' },
          },
        },
        AdminUser: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            full_name: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
            is_active: { type: 'boolean' },
            stripe_customer_id: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            subscription_id: { type: 'integer' },
            sub_status: { type: 'string' },
            plan_name: { type: 'string' },
            price: { type: 'number' },
            plan_interval: { type: 'string' },
            current_period_start: { type: 'string', format: 'date' },
            current_period_end: { type: 'string', format: 'date' },
            cancel_at_period_end: { type: 'boolean' },
            payment_method_id: { type: 'integer' },
            card_brand: { type: 'string' },
            card_last4: { type: 'string' }
          }
        },
        AdminSubscription: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            plan_id: { type: 'integer' },
            status: { type: 'string' },
            current_period_start: { type: 'string', format: 'date' },
            current_period_end: { type: 'string', format: 'date' },
            cancel_at_period_end: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            full_name: { type: 'string' },
            email: { type: 'string' },
            plan_name: { type: 'string' },
            price: { type: 'number' },
            plan_interval: { type: 'string' },
            card_brand: { type: 'string' },
            card_last4: { type: 'string' }
          }
        },
        AdminTransaction: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            subscription_id: { type: 'integer' },
            user_id: { type: 'integer' },
            processor: { type: 'string' },
            processor_transaction_id: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            status: { type: 'string' },
            failure_reason: { type: 'string' },
            billing_period_start: { type: 'string', format: 'date' },
            billing_period_end: { type: 'string', format: 'date' },
            created_at: { type: 'string', format: 'date-time' },
            full_name: { type: 'string' },
            email: { type: 'string' }
          }
        }
      },
    },
    tags: [
      { name: 'Auth', description: 'Autenticación de usuarios' },
      { name: 'Admin', description: 'Panel de administración' },
      { name: 'Payments', description: 'Pagos con Stripe' },
      { name: 'PayPal', description: 'Pagos con PayPal' },
      { name: 'Plans', description: 'Planes de suscripción (público)' },
      { name: 'Watch History', description: 'Historial de reproducción' },
      { name: 'Watchlist', description: 'Lista de "Ver más tarde"' }
    ],
  },
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;