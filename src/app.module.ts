import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MIGRATIONS_GLOB } from './database/data-source.js';
import { AddressesModule } from './addresses/addresses.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { ContactMessagesModule } from './contact-messages/contact-messages.module.js';
import { QuoteRequestsModule } from './quote-requests/quote-requests.module.js';
import { MailModule } from './mail/mail.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // Development auto-syncs the schema; production applies the migrations in
        // src/database/migrations on startup (generate one after changing an entity).
        synchronize: config.get('NODE_ENV') !== 'production',
        migrations: [MIGRATIONS_GLOB],
        migrationsRun: config.get('NODE_ENV') === 'production',
      }),
    }),
    MailModule,
    StorageModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    QuoteRequestsModule,
    ContactMessagesModule,
    BookingsModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
