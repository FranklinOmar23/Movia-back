/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticación y gestión de usuarios
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');


/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - full_name
 *         - email
 *         - password
 *       properties:
 *         full_name:
 *           type: string
 *           description: Nombre completo del usuario
 *           example: Juan Pérez
 *         email:
 *           type: string
 *           format: email
 *           description: Correo electrónico del usuario
 *           example: juan.perez@example.com
 *         password:
 *           type: string
 *           format: password
 *           description: Contraseña (mínimo 6 caracteres)
 *           example: MiPassword123
 *         role:
 *           type: string
 *           description: Rol del usuario (user por defecto)
 *           enum: [user, admin]
 *           default: user
 *           example: user
 *     
 *     RegisterResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Usuario registrado exitosamente
 *         token:
 *           type: string
 *           description: JWT token para autenticación
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             full_name:
 *               type: string
 *               example: Juan Pérez
 *             email:
 *               type: string
 *               example: juan.perez@example.com
 *             role:
 *               type: string
 *               example: user
 *             is_active:
 *               type: boolean
 *               example: true
 *             created_at:
 *               type: string
 *               format: date-time
 *     
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: juan.perez@example.com
 *         password:
 *           type: string
 *           format: password
 *           example: MiPassword123
 *     
 *     LoginResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             email:
 *               type: string
 *             full_name:
 *               type: string
 *             role:
 *               type: string
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Registrar un nuevo usuario
 *     description: Crea una nueva cuenta de usuario y devuelve un token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterResponse'
 *       400:
 *         description: Datos inválidos (email inválido, contraseña muy corta, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: La contraseña debe tener al menos 6 caracteres
 *       409:
 *         description: El email ya está registrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: El email ya está registrado
 *       500:
 *         description: Error del servidor
 */
router.post('/register', authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Iniciar sesión
 *     description: Autentica un usuario y devuelve un token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Email y contraseña requeridos
 *       401:
 *         description: Credenciales inválidas
 *       403:
 *         description: Cuenta desactivada
 *       500:
 *         description: Error del servidor
 */
router.post('/login', authController.login);




const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/auth/profile:
 *   patch:
 *     tags:
 *       - Auth
 *     summary: Actualizar perfil del usuario autenticado
 *     description: Permite al usuario actualizar su nombre, email y/o contraseña. Para cambiar la contraseña es obligatorio enviar la contraseña actual.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 description: Nuevo nombre completo (mínimo 3 caracteres)
 *                 example: Juan Pérez Actualizado
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Nuevo correo electrónico
 *                 example: nuevo.email@example.com
 *               current_password:
 *                 type: string
 *                 format: password
 *                 description: Contraseña actual (requerida solo si se cambia la contraseña)
 *                 example: MiPasswordActual123
 *               new_password:
 *                 type: string
 *                 format: password
 *                 description: Nueva contraseña (mínimo 6 caracteres)
 *                 example: MiNuevoPassword123
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Perfil actualizado exitosamente
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     full_name:
 *                       type: string
 *                       example: Juan Pérez Actualizado
 *                     email:
 *                       type: string
 *                       example: nuevo.email@example.com
 *                     role:
 *                       type: string
 *                       example: user
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Datos inválidos o sin campos para actualizar
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Debes proporcionar tu contraseña actual
 *       401:
 *         description: Token inválido o contraseña actual incorrecta
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: La contraseña actual es incorrecta
 *       404:
 *         description: Usuario no encontrado
 *       409:
 *         description: El email ya está en uso por otro usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: El email ya está en uso
 *       500:
 *         description: Error del servidor
 */
router.get('/me', auth, authController.getMe);  
router.patch('/profile', auth, authController.updateProfile);


module.exports = router;