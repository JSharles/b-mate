import { AppService } from './app.service';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from './test/prisma-mock';

describe('AppService', () => {
  let prisma: PrismaMock;
  let service: AppService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AppService(asPrismaService(prisma));
  });

  it('getHello returns the greeting', () => {
    expect(service.getHello()).toBe('Hello World!');
  });

  it('getHealth pings the database and reports connected', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.getHealth();

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result).toEqual({ status: 'ok', db: 'connected' });
  });
});
