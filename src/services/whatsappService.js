import sendToWhatsApp from "../services/httpRequest/sendToWhatsApp.js";
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

class WhatsAppService {
  async sendMessage(to, body, messageId) {
    const data = {
      messaging_product: "whatsapp",
      to,
      text: { body },
    };

    await sendToWhatsApp(data);
  }

  async sendInteractiveButtons(to, bodyText, buttons) {
    const data = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons,
        },
      },
    };

    await sendToWhatsApp(data);
  }

  async sendMediaMessage(to, type, mediaUrl, caption) {
    const mediaObject = {};

    switch (type) {
      case "image":
        mediaObject.image = { link: mediaUrl, caption: caption };
        break;
      case "audio":
        mediaObject.audio = { link: mediaUrl };
        break;
      case "video":
        mediaObject.video = { link: mediaUrl, caption: caption };
        break;
      case "document":
        mediaObject.document = {
          link: mediaUrl,
          caption: caption,
          filename: "medpet-file.pdf",
        };
        break;
      default:
        throw new Error("Not Supported Media Type");
    }

    const data = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: type,
      ...mediaObject,
    };

    await sendToWhatsApp(data);
  }

  async markAsRead(messageId) {
    const data = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    };

    await sendToWhatsApp(data);
  }

  async sendContactMessage(to, contact) {
    const data = {
      messaging_product: "whatsapp",
      to,
      type: "contacts",
      contacts: [contact],
    };

    await sendToWhatsApp(data);
  }

  async sendLocationMessage(to, latitude, longitude, name, address) {
    const data = {
      messaging_product: "whatsapp",
      to,
      type: "location",
      location: {
        latitude: latitude,
        longitude: longitude,
        name: name,
        address: address,
      },
    };
    await sendToWhatsApp(data);
  }

  async downloadMedia(mediaId) {
    try {
      const response = await axios({
        method: "get",
        url: `${config.BASE_URL}/${config.API_VERSION}/${mediaId}`, // Reemplaza con tu versión de la API
        headers: {
          Authorization: `Bearer ${process.env.API_TOKEN}`, // Asegúrate de tener tu token configurado
        },
      });

      const mediaUrl = response.data.url;

      const mediaResponse = await axios({
        method: "get",
        url: mediaUrl,
        responseType: "arraybuffer", // Para manejar datos binarios (imágenes)
        headers: {
          Authorization: `Bearer ${process.env.API_TOKEN}`,
        },
      });

      // Guardar la imagen en un archivo temporal
      const tempFilePath = path.join(process.cwd(), "temp", `${mediaId}.jpg`); // Ajusta la extensión si es necesario
      await fs.writeFile(tempFilePath, mediaResponse.data);

      return tempFilePath; // Devolver la ruta del archivo
    } catch (error) {
      console.error("Error downloading media:", error);
      throw error; // Re-lanza el error para que sea manejado en messageHandler.js
    }
  }
}

export default new WhatsAppService();
