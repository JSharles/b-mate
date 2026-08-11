import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { DocumentStorageClient } from '../source/document-storage.client';
import { DocumentaryResetCommand } from './documentary-reset.command';
import { DocumentaryResetService } from './documentary-reset.service';
import { DocumentaryTransitionService } from './documentary-transition.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  providers: [
    DocumentStorageClient,
    DocumentaryTransitionService,
    DocumentaryResetService,
    DocumentaryResetCommand,
  ],
  exports: [DocumentaryTransitionService, DocumentaryResetService],
})
export class DocumentaryResetModule {}
