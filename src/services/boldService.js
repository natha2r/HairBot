import axios from 'axios';

// Configuración de la API
const apiKey = 'TU_API_KEY'; // Reemplaza con tu API Key de Bold
const apiUrl = 'https://api.bold.co/pagos'; // URL base de la API de Bold

const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
};

/**
 * Genera un enlace de pago
 * @param {number} amount - Monto a cobrar
 * @param {string} currency - Moneda (ej. 'MXN')
 * @param {string} reference - Referencia única del pago
 * @param {string} customerEmail - Correo del cliente
 * @param {string} description - Descripción del pago
 * @param {string} redirectUrl - URL de redirección después del pago
 * @returns {Promise<string>} - Enlace de pago generado
 */
export async function generatePaymentLink(amount, currency, reference, customerEmail, description, redirectUrl) {
    const paymentData = {
        amount,
        currency,
        reference,
        customer: {
            email: customerEmail
        },
        description,
        redirect_url: redirectUrl
    };

    try {
        const response = await axios.post(`${apiUrl}/payments`, paymentData, { headers });
        return response.data.payment_link; // Retorna el enlace de pago
    } catch (error) {
        console.error('Error al generar el enlace de pago:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Verifica el estado de un pago
 * @param {string} paymentId - ID del pago
 * @returns {Promise<object>} - Estado del pago
 */
export async function checkPaymentStatus(paymentId) {
    try {
        const response = await axios.get(`${apiUrl}/payments/${paymentId}`, { headers });
        return response.data; // Retorna el estado del pago
    } catch (error) {
        console.error('Error al verificar el estado del pago:', error.response?.data || error.message);
        throw error;
    }
}