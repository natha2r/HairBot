// MessageHandler.js
// Manejador de mensajes para chatbot de peluquería

import whatsappService from "./whatsappService.js";
import appendToSheet from "./googleSheetsService.js";
import geminiService from "./geminiService.js";
import * as messages from "./messages.js";

class MessageHandler {
    constructor() {
        this.appointmentState = {};
        this.consultationState = {};
    }

    // --- Manejo de Mensajes Entrantes ---

    async handleIncomingMessage(message, senderInfo) {
        if (message?.type === "text") {
            await this.handleTextMessage(message, senderInfo);
        } else if (message?.type === "interactive") {
            await this.handleInteractiveMessage(message);
        } else if (message?.type === "image") {
            await this.handleImageMessage(message.from, message.image.id);
        }
        await whatsappService.markAsRead(message.id);
    }

    async handleTextMessage(message, senderInfo) {
        const incomingMessage = message.text.body.toLowerCase().trim();
        if (this.isGreeting(incomingMessage)) {
            await this.sendWelcomeMessage(message.from, senderInfo);
            await this.sendWelcomeMenu(message.from);
        } else if (this.appointmentState[message.from]) {
            await this.handleAppointmentFlow(message.from, incomingMessage);
        } else if (this.consultationState[message.from]) {
            await this.handleConsultationFlow(message.from, incomingMessage);
        } else {
            await this.handleMenuOption(message.from, incomingMessage);
        }
    }

    async handleInteractiveMessage(message) {
        const option = message?.interactive?.button_reply?.id;
        await this.handleMenuOption(message.from, option);
    }

    async preliminaryAnalysis(to, photo1Id, photo2Id) {
        try {
            const photo1Path = await whatsappService.downloadMedia(photo1Id);
            const photo2Path = await whatsappService.downloadMedia(photo2Id);
    
            if (!photo1Path || !photo2Path) {
                throw new Error("Failed to download one or both images.");
            }
    
            // Usando analyzeHairImages para el análisis preliminar (corto)
            const preliminaryResponse = await geminiService.analyzeHairImages(
                photo1Path,
                photo2Path,
                "Eres un experto en cuidado capilar. Realiza un análisis preliminar breve del estado del cuero cabelludo y el cabello. Indica de forma concisa si el cuero cabelludo es seco, graso o normal, y si hay signos de caspa, irritación o caída."
            );
            await whatsappService.sendMessage(to, preliminaryResponse);
            await this.offerFullAnalysis(to);
        } catch (error) {
            console.error("Error analyzing images:", error);
            await whatsappService.sendMessage(
                to,
                "Ocurrió un error al analizar las imágenes."
            );
        }
    }

    // Botones después del análsiis corto
    async offerFullAnalysis(to) {
        const message =
            "¿Deseas un análisis completo y detallado por correo electrónico? (Costo: $50.000)";
        const buttons = [
            { type: "reply", reply: { id: "full_analysis_yes", title: "Sí" } },
            { type: "reply", reply: { id: "full_analysis_no", title: "No" } },
        ];
        await whatsappService.sendInteractiveButtons(to, message, buttons);
    }


    async handleImageMessage(to, imageId) {
        try {
            const state = this.consultationState[to];

            if (state && state.step === "photo1") {
                state.photo1Id = imageId;
                state.step = "photo2";
                await whatsappService.sendMessage(to, messages.PRIMERA_FOTO_MESSAGE);
            } else if (state && state.step === "photo2") {
                state.photo2Id = imageId;
                await whatsappService.sendMessage(to, messages.SEGUNDA_FOTO_MESSAGE);
                await this.preliminaryAnalysis(to, state.photo1Id, state.photo2Id);
                //delete this.consultationState[to]; // Eliminar el estado luego del analisis preliminar
            } else {
                await whatsappService.sendMessage(to, messages.INSTRUCCIONES_MESSAGE);
            }
        } catch (error) {
            console.error("Error processing image:", error);
            await whatsappService.sendMessage(to, messages.ERROR_IMAGE_MESSAGE);
        }
    }

    
    
    
    // --- Saludos y Menú Principal ---

    isGreeting(message) {
        const greetings = ["hola", "hello", "hi", "buenas tardes"];
        return greetings.includes(message);
    }

    getSenderName(senderInfo) {
        return senderInfo.profile?.name || senderInfo.wa_id;
    }

    async sendContact(to) {
        const contact = {
            addresses: [
                {
                    street: "Cra 31 #50 - 21",
                    city: "Bucaramanga",
                    state: "",
                    zip: "",
                    country: "",
                    country_code: "",
                    type: "WORK"
                }
            ],
            emails: [
                {
                    email: "tecniclaud@gmail.com",
                    type: "WORK"
                }
            ],
            name: {
                formatted_name: "Profesional Claudia",
                first_name: "Claudia Moreno",
                last_name: "Moreno",
                middle_name: "",
                suffix: "",
                prefix: ""
            },
            org: {
                company: "Claudia Moreno",
                department: "Atención al Cliente",
                title: "Representante"
            },
            phones: [
                {
                    phone: "+573224457046",
                    wa_id: "573224457046",
                    type: "WORK"
                }
            ],
            urls: [
                {
                    url: "https://claudiamoreno.webnode.com.co",
                    type: "WORK"
                }
            ]
        };

        await whatsappService.sendContactMessage(to, contact);
    }

    //Saludo de Bienvenida
    async sendWelcomeMessage(to, senderInfo) {
        const name = this.getSenderName(senderInfo);
        await whatsappService.sendMessage(to, messages.WELCOME_MESSAGE(name));
    }

    //Opciones de Bienvenida
    async sendWelcomeMenu(to) {
        const menuMessage = "Elige una Opción";
        const buttons =
            [
                { type: "reply", reply: { id: "option_1", title: "✨Diagnostico capilar" }, },
                { type: "reply", reply: { id: "option_2", title: "Cita con Profesional" }, },
                { type: "reply", reply: { id: "option_3", title: "Ver Productos" } },
            ];

        await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
    }

    async sendConsultationOptions(to) {
        try {
            const buttons = [
                {
                    type: "reply",
                    reply: { id: "option_book_appointment", title: "Reservar Cita" },
                },
                {
                    type: "reply",
                    reply: { id: "option_more_info", title: "Más Información" },
                },
                {
                    type: "reply",
                    reply: { id: "option_another_analysis", title: "Otro Análisis" },
                },
            ];
            await whatsappService.sendInteractiveButtons(
                to,
                "Selecciona una opción:",
                buttons
            );
        } catch (error) {
            console.error("Error sending consultation options:", error);
            await whatsappService.sendMessage(
                to,
                "Ocurrió un error al enviar las opciones."
            );
        }
    }

    async processFullAnalysis(to) {
        try {
            // Simulación de pago (reemplazar con una pasarela de pago real)
            await whatsappService.sendMessage(to, "Procesando pago...");
            // Lógica para obtener el correo del usuario (puedes pedirlo por WhatsApp)
            const userEmail = "usuario@email.com"; // Reemplazar
            const state = this.consultationState[to];
            const photo1Path = await whatsappService.downloadMedia(state.photo1Id);
            const photo2Path = await whatsappService.downloadMedia(state.photo2Id);

            const fullResponse = await geminiService.fullHairAnalysis(
                photo1Path,
                photo2Path
            );
            await emailService.sendEmail(
                userEmail,
                "Análisis Capilar Completo",
                fullResponse
            );
            await whatsappService.sendMessage(
                to,
                "El análisis completo ha sido enviado a tu correo."
            );
            delete this.consultationState[to]; // Limpiar el estado
        } catch (error) {
            console.error("Error processing full analysis:", error);
            await whatsappService.sendMessage(
                to,
                "Ocurrió un error al procesar el análisis completo."
            );
        }
    }

    // --- Manejo de Opciones del Menú ---

    async handleMenuOption(to, option) {
        let response;
        switch (option) {
            case "full_analysis_yes":
                await this.processFullAnalysis(to);
                return; // Importante: salir de la función
            case "full_analysis_no":
                await whatsappService.sendMessage(to, "¡Gracias por tu consulta!");
                return; // Importante: salir de la función
            case "option_1":
                this.consultationState[to] = { step: "photo1" };
                response =
                    " ¡Comencemos con tu consulta capilar! Para brindarte un análisis preciso, envía una foto clara de tu cuero cabelludo con buena iluminación. ✨";
                break;
            case "option_2":
                await whatsappService.sendMessage(to, messages.AGENDA_MESSAGE); // Primero, enviar el mensaje
                await this.sendContact(to); // Luego, enviar el contacto
                return;
            case "option_3":
                response = "Nos encontramos en Av. Belleza 123, Ciudad.";
                await this.sendLocation(to);
                break;
            case "option_4":
                response =
                    "Si tienes una emergencia capilar, contáctanos al +1234567890.";
                await this.sendContact(to);
                break;
            default:
                response =
                    "Lo siento, no entendí tu selección. Elige una opción válida.";
        }
        await whatsappService.sendMessage(to, response);
    }

    // --- Flujo de Agendar Cita ---

    async handleAppointmentFlow(to, message) {
        const state = this.appointmentState[to];
        let response;
        switch (state.step) {
            case "name":
                state.name = message;
                state.step = "service";
                response = "¿Qué servicio deseas? (Corte, Tinte, Tratamiento, etc.)";
                break;
            case "service":
                state.service = message;
                response = this.completeAppointment(to);
                break;
        }
        await whatsappService.sendMessage(to, response);
    }

    completeAppointment(to) {
        const appointment = this.appointmentState[to];
        delete this.appointmentState[to];
        const userData = [
            to,
            appointment.name,
            appointment.service,
            new Date().toISOString(),
        ];
        appendToSheet(userData);
        return `Tu cita ha sido registrada.\nNombre: ${appointment.name}\nServicio: ${appointment.service}\nNos pondremos en contacto para confirmar la fecha y hora.`;
    }

    // --- Flujo de Consulta de Cabello ---

    async handleConsultationFlow(to, message) {
        delete this.consultationState[to];
        await whatsappService.sendMessage(
            to,
            "Por favor, envie la imagen como un mensaje aparte."
        );
    }

    async analyzeAndSendResults(to, photo1Id, photo2Id) {
        try {
            const photo1Path = await whatsappService.downloadMedia(photo1Id);
            const photo2Path = await whatsappService.downloadMedia(photo2Id);

            if (!photo1Path || !photo2Path) {
                throw new Error("Failed to download one or both images.");
            }

            const response = await geminiService.analyzeHairImages(
                photo1Path,
                photo2Path
            );
            await whatsappService.sendMessage(to, response);
            await this.sendConsultationOptions(to);
        } catch (error) {
            console.error("Error analyzing images:", error);
            await whatsappService.sendMessage(
                to,
                "Ocurrió un error al analizar las imágenes."
            );
        }
    }

    // --- Funciones Auxiliares ---

    async sendLocation(to) {
        const latitude = 6.2071694;
        const longitude = -75.574607;
        const name = "Peluquería Estilo Perfecto";
        const address = "Av. Belleza 123, Ciudad.";
        await whatsappService.sendLocationMessage(
            to,
            latitude,
            longitude,
            name,
            address
        );
    }
}

export default new MessageHandler();