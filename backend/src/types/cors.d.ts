declare module 'cors' {
  import { Express, Request, Response, NextFunction } from 'express';

  interface CorsOptions {
    origin?: string | string[] | boolean | ((origin: string, callback: (err: Error | null, allow?: boolean) => void) => void);
    credentials?: boolean;
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    maxAge?: number;
    preflightContinue?: boolean;
    optionsSuccessStatus?: number;
  }

  export function cors(options?: CorsOptions): (req: Request, res: Response, next: NextFunction) => void;
  export default cors;
}

