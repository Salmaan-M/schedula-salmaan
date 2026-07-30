import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'Schedula Backend API',
      version: '1.0.0',
      message: 'API is running successfully 🚀',
    };
  }
}
