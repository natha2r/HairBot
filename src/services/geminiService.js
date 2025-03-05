import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config/env.js";

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY, { apiVersion: "v1" });

const geminiService = async (message) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const fullMessage = `Eres parte de un servicio de asistencia online y debes comportarte como un veterinario de un comercio llamado "MedPet". Responde con una explicación clara. Si es una emergencia, indica que deben llamarnos (MedPet). No agregues saludos ni conversación adicional.\n\nPregunta del usuario: ${message}`;

        const response = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullMessage }] }]
        });

        console.log("Respuesta de Gemini:", JSON.stringify(response, null, 2));

        if (!response?.response?.candidates?.length) {
            throw new Error("La API de Gemini no devolvió una respuesta válida.");
        }

        return response.response.candidates[0]?.content?.parts?.[0]?.text || "No se recibió respuesta del modelo.";
    } catch (error) {
        console.error("Error en Gemini:", error);
        return "Hubo un error con la IA.";
    }
};

export default geminiService;
