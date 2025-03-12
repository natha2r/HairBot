// MessageHandler.js
// Manejador de mensajes para chatbot de peluquería

import whatsappService from "./whatsappService.js";
import appendToSheet from "./googleSheetsService.js";
import geminiService from "./geminiService.js";

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

  async handleImageMessage(to, imageId) {
    try {
      const imageUrl = await whatsappService.downloadMedia(imageId);
      const response = await geminiService.analyzeHairImage(imageUrl);
      await whatsappService.sendMessage(to, response);
    } catch (error) {
      console.error("Error processing image:", error);
      await whatsappService.sendMessage(to, "Ocurrió un error al procesar la imagen.");
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

  async sendWelcomeMessage(to, senderInfo) {
    const name = this.getSenderName(senderInfo);
    const welcomeMessage = `Hola ${name}, Bienvenido a ESTILO PERFECTO, tu peluquería de confianza. ¿En qué puedo ayudarte hoy?`;
    await whatsappService.sendMessage(to, welcomeMessage);
  }

  async sendWelcomeMenu(to) {
    const menuMessage = "Elige una Opción";
    const buttons = [
      { type: "reply", reply: { id: "option_1", title: "Consulta capilar" } },
      { type: "reply", reply: { id: "option_2", title: "Reservar cita" } },
      { type: "reply", reply: { id: "option_3", title: "Contaco y ubicación" } },
    ];
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  // --- Manejo de Opciones del Menú ---

  async handleMenuOption(to, option) {
    let response;
    switch (option) {
      case "option_2":
        this.appointmentState[to] = { step: "name" };
        response = "Por favor, ingresa tu nombre:";
        break;
      case "option_1":
        this.consultationState[to] = { step: "image" };
        response = "Por favor, envía una foto clara de tu cabello para que pueda analizarlo.";
        break;
      case "option_3":
        response = "Nos encontramos en Av. Belleza 123, Ciudad.";
        await this.sendLocation(to);
        break;
      case "option_4":
        response = "Si tienes una emergencia capilar, contáctanos al +1234567890.";
        await this.sendContact(to);
        break;
      default:
        response = "Lo siento, no entendí tu selección. Elige una opción válida.";
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
    await whatsappService.sendMessage(to,"Por favor, envie la imagen como un mensaje aparte.");
  }

  // --- Funciones Auxiliares ---

  async sendContact(to) {
    await whatsappService.sendMessage(to, "Llámanos al +1234567890 para asistencia inmediata.");
  }

  async sendLocation(to) {
    const latitude = 6.2071694;
    const longitude = -75.574607;
    const name = "Peluquería Estilo Perfecto";
    const address = "Av. Belleza 123, Ciudad.";
    await whatsappService.sendLocationMessage(to, latitude, longitude, name, address);
  }
}

export default new MessageHandler();