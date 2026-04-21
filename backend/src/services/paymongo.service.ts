import dotenv from 'dotenv';
import path from 'path';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface QRPhSourceResult {
  sourceId: string;
  qrCodeUrl: string;
  amount: number;
}

export class PayMongoService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paymongo.com/v1';
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    if (!process.env.PAYMONGO_SECRET_KEY) {
      throw new Error('PAYMONGO_SECRET_KEY is required');
    }

    this.secretKey = process.env.PAYMONGO_SECRET_KEY;
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      },
    });
  }

  private getAuthHeader(): string {
    const encoded = Buffer.from(`${this.secretKey}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  /**
   * Create a PayMongo QR Ph source for the requested amount.
   * Returns the source ID, QR code URL, and amount in centavos.
   */
  async createQRPhSource(amount: number, description: string): Promise<QRPhSourceResult> {
    try {
      const response = await this.axiosInstance.post('/qrph/generate', {
        data: {
          attributes: {
            kind: 'instore',
            description,
          },
        },
      });

      const code = response.data?.data;
      if (!code || !code.attributes) {
        throw new Error('Invalid PayMongo response: missing QR PH attributes');
      }

      const qrCodeImage = code.attributes.qr_image;
      if (!qrCodeImage) {
        throw new Error('PayMongo response does not include qr_image');
      }

      return {
        sourceId: code.id,
        qrCodeUrl: qrCodeImage,
        amount,
      };
    } catch (error: any) {
      console.error('createQRPhSource error:', {
        message: error.message,
        responseData: error.response?.data,
      });
      throw new Error(`Failed to create PayMongo QR Ph source: ${error.message}`);
    }
  }

  /**
   * Retrieve the current status of a PayMongo source.
   * Returns one of PayMongo's source status values.
   */
  async getSourceStatus(
    sourceId: string,
  ): Promise<'pending' | 'chargeable' | 'paid' | 'failed' | 'expired'> {
    try {
      const response = await this.axiosInstance.get(`/sources/${sourceId}`);
      const status = response.data?.data?.attributes?.status;

      if (!status) {
        throw new Error('Invalid response from PayMongo when getting source status');
      }

      return status;
    } catch (error: any) {
      console.error('getSourceStatus error:', {
        sourceId,
        message: error.message,
        responseData: error.response?.data,
      });
      throw new Error(`Failed to get PayMongo source status: ${error.message}`);
    }
  }

  /**
   * Create a payment charge for a chargeable source.
   * This is called automatically when source becomes chargeable.
   */
  async createCharge(sourceId: string, amount: number, description: string): Promise<any> {
    try {
      const response = await this.axiosInstance.post('/payments', {
        data: {
          attributes: {
            amount,
            currency: 'PHP',
            description,
            source: {
              id: sourceId,
              type: 'source',
            },
          },
        },
      });

      return response.data?.data;
    } catch (error: any) {
      console.error('createCharge error:', {
        sourceId,
        amount,
        message: error.message,
        responseData: error.response?.data,
      });
      throw new Error(`Failed to create PayMongo charge: ${error.message}`);
    }
  }

  /**
   * Validate the PayMongo webhook signature using HMAC-SHA256.
   */
  validateWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    try {
      const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      return signature === expectedSignature;
    } catch (error: any) {
      console.error('validateWebhookSignature error:', error.message);
      return false;
    }
  }
}

export const paymongoService = new PayMongoService();
