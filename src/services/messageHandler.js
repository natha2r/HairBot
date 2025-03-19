import whatsappService from "./whatsappService.js";
import geminiService from "./geminiService.js";
import * as messages from "./messages.js";

class MessageHandler {
    constructor() {
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
        } else if (this.consultationState[message.from]) {
            await this.handleConsultationFlow(message.from, incomingMessage);
        } else {
            await this.handleMenuOption(message.from, incomingMessage);
        }
    }

    async handleInteractiveMessage(message) {
        if (message?.interactive?.button_reply) {
            await this.handleInteractiveButtonMessage(message);
        } else if (message?.interactive?.list_reply) {
            await this.handleInteractiveListMessage(message);
        }
    }

    async handleInteractiveButtonMessage(message) {
        const option = message?.interactive?.button_reply?.id;
        await this.handleMenuOption(message.from, option);
    }

    async handleInteractiveListMessage(message) {
        const option = message?.interactive?.list_reply?.id;
        await this.handleMenuOption(message.from, option);
    }

    async preliminaryAnalysis(to, photo1Id, photo2Id) {
        try {
            const photo1Path = await whatsappService.downloadMedia(photo1Id);
            const photo2Path = await whatsappService.downloadMedia(photo2Id);

            if (!photo1Path || !photo2Path) {
                throw new Error("No se pudo descargar una o ambas imágenes.");
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
            console.error("Error analisando imagenes:", error);
            await whatsappService.sendMessage(
                to,
                "Ocurrió un error al analizar las imágenes."
            );
        }
    }

    // Botones después del análisis corto
    async offerFullAnalysis(to) {
        const message =
            "¿Deseas un análisis completo y detallado? Costo: $50.000";
        const buttons = [
            { type: "reply", reply: { id: "full_analysis_yes", title: "Sí" } },
            { type: "reply", reply: { id: "full_analysis_no", title: "No" } },
        ];
        await whatsappService.sendInteractiveButtons(to, message, buttons);
    }

    async handleImageMessage(to, imageId) {
        try {
            const state = this.consultationState[to];
            const baseUrl = 'https://8spn764p-3000.use2.devtunnels.ms/images/';

            if (state && state.step === "photo1") {
                state.photo1Id = imageId;
                state.step = "photo2";
                const imageUrl = baseUrl + 'foto_espalda.jpg';
                await whatsappService.sendMediaMessage(
                    to,
                    "image",
                    imageUrl,
                    messages.SEGUNDA_FOTO_MESSAGE);
            } else if (state && state.step === "photo2") {
                state.photo2Id = imageId;
                await whatsappService.sendMessage(to, messages.ANALISIS_MESSAGE);
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
        const sections = [
            {
                title: "Opciones Principales",
                rows: [
                    { id: "diagnostico", title: "Diagnóstico Capilar" },
                    { id: "cita", title: "Cita con Profesional" },
                    { id: "productos", title: "Ver Productos" },
                    { id: "ubicacion", title: "Ubicación" },
                ],
            },
        ];

        await whatsappService.sendInteractiveList(
            to,
            "Selecciona una opción:",
            "Menú",
            sections
        );
    }

    async sendConsultationOptions(to) {
        try {
            const buttons = [
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

            // Usando analyzeHairImages para el análisis completo (detallado)
            const fullResponse = await geminiService.analyzeHairImages(
                photo1Path,
                photo2Path,
                "Eres un experto en cuidado capilar y salud del cuero cabelludo. Analiza detalladamente las dos imágenes proporcionadas y realiza un diagnóstico integral del estado del cuero cabelludo y del cabello. Evalúa el cuero cabelludo determinando si es seco, graso, mixto o normal, e identifica posibles afecciones como caspa, irritación, sensibilidad, inflamación o signos de caída. Examina la fibra capilar considerando su textura (liso, ondulado, rizado o afro), su grosor (fino, medio o grueso) y su estado general (hidratado, seco, dañado, quebradizo, poroso, con frizz, con puntas abiertas o teñido)."
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
        console.log("handleMenuOption called with:", { to, option });

        const baseUrl = 'https://8spn764p-3000.use2.devtunnels.ms/images/';
        let response;
        switch (option) {
            case "full_analysis_yes":
                await this.processFullAnalysis(to);
                return; // Importante: salir de la función
            case "full_analysis_no":
                await whatsappService.sendMessage(to, "¡Gracias por tu consulta!");
                return; // Importante: salir de la función
            case "diagnostico":
                const imageUrl = baseUrl + 'foto_cuero_cabelludo.jpg';
                this.consultationState[to] = { step: "photo1" };
                try {
                    await whatsappService.sendMediaMessage(
                        to,
                        "image",
                        imageUrl,
                        messages.PRIMERA_FOTO_MESSAGE
                    );
                } catch (error) {
                    console.error("Error sending media message:", error);
                    await whatsappService.sendMessage(to, "Ocurrió un error al enviar la imagen de ejemplo.");
                }
                return;
            case "cita":
                await whatsappService.sendMessage(to, messages.AGENDA_MESSAGE); // Primero, enviar el mensaje
                await this.sendContact(to); // Luego, enviar el contacto
                return;
            case "productos":
                await whatsappService.sendMessage(to, messages.PRODUCTOS_MESSAGE); // Llama a la función para mostrar productos
                await whatsappService.sendInteractiveButtons(
                    to,
                    "¿Necesitas ayuda adicional?",
                    [
                        { type: "reply", reply: { id: "terminar", title: "No, gracias" } },
                        { type: "reply", reply: { id: "menu", title: "Menú principal" } },
                    ]
                );
                break;
            case "ubicacion":
                const latitude = 7.114296;
                const longitude = -73.112385;
                const name = "Alpelo Peluquería";
                const address = "📌 Cra. 31 #50 - 21, Sotomayor, Bucaramanga, Santander";

                await whatsappService.sendLocationMessage(
                    to,
                    latitude,
                    longitude,
                    name,
                    address
                );

                await whatsappService.sendMessage(to, messages.HORARIOS_MESSAGE);
                await whatsappService.sendInteractiveButtons(
                    to,
                    "¿Necesitas ayuda adicional?",
                    [
                        { type: "reply", reply: { id: "terminar", title: "No, gracias" } },
                        { type: "reply", reply: { id: "menu", title: "Menú principal" } },
                    ]
                );
                break;

            case "terminar":
                await whatsappService.sendMessage(to, "¡Gracias por contactarnos! ¡Esperamos verte pronto!");
                break;

            case "menu":
                await this.sendWelcomeMenu(to); // Reenvía el menú principal
                break;

            default:
                response =
                    "Lo siento, no entendí tu selección. Elige una opción válida.";
                await whatsappService.sendMessage(to, response);
        }

        console.log("Sending message with response:", response);
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
            console.error("Error analisando imagenes:", error);
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