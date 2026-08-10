import type { Resource, User } from '@prisma/client';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

const fakeUser: User = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'jc@example.com',
  passwordHash: 'hashed',
  accountKind: 'developer',
  company: null,
  address: null,
  phone: null,
  image: null,
  bio: null,
  github: null,
  githubId: null,
  socials: null,
  linkedin: null,
  malt: null,
  website: null,
  roleTitle: null,
  status: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeFile = {
  buffer: Buffer.from('%PDF-1.4 fake'),
  originalname: 'Architecture overview.pdf',
  mimetype: 'application/pdf',
  size: 1024,
} as Express.Multer.File;

const fakeResource: Resource = {
  id: 'resource-1',
  projectId: 'project-1',
  source: 'upload',
  status: 'pending',
  title: 'Architecture overview',
  originalFileKey: 'resources/project-1/a.pdf',
  originalFileName: 'Architecture overview.pdf',
  originalFileMimeType: 'application/pdf',
  originalFileSizeBytes: 1024,
  notionPageUrl: null,
  failureReason: null,
  anthropicBatchId: 'batch_123',
  addedByUserId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ResourcesController', () => {
  let resourcesService: jest.Mocked<
    Pick<
      ResourcesService,
      | 'createFromUpload'
      | 'createFromNotion'
      | 'findAllForProject'
      | 'findOne'
      | 'delete'
    >
  >;
  let controller: ResourcesController;

  beforeEach(() => {
    resourcesService = {
      createFromUpload: jest.fn(),
      createFromNotion: jest.fn(),
      findAllForProject: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    controller = new ResourcesController(
      resourcesService as unknown as ResourcesService,
    );
  });

  describe('upload', () => {
    it('delegates to the service with the current user, project id, and file', async () => {
      resourcesService.createFromUpload.mockResolvedValue(fakeResource);

      const result = await controller.upload(fakeUser, 'project-1', fakeFile);

      expect(resourcesService.createFromUpload).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        fakeFile,
      );
      expect(result).toEqual(fakeResource);
    });

    it('propagates a rejection from the service (invalid MIME/size) rather than swallowing it', async () => {
      resourcesService.createFromUpload.mockRejectedValue(
        new Error('Unsupported file type'),
      );

      await expect(
        controller.upload(fakeUser, 'project-1', fakeFile),
      ).rejects.toThrow('Unsupported file type');
    });
  });

  describe('connectNotion', () => {
    it('delegates to the service with the current user, project id, and page URL', async () => {
      resourcesService.createFromNotion.mockResolvedValue({
        ...fakeResource,
        source: 'notion',
        notionPageUrl: 'https://notion.so/some-page',
      });

      const result = await controller.connectNotion(fakeUser, 'project-1', {
        pageUrl: 'https://notion.so/some-page',
      });

      expect(resourcesService.createFromNotion).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'https://notion.so/some-page',
      );
      expect(result.source).toBe('notion');
    });

    it('propagates a rejection from the service (no connection configured/inaccessible page) rather than swallowing it', async () => {
      resourcesService.createFromNotion.mockRejectedValue(
        new Error('Unable to access this Notion page'),
      );

      await expect(
        controller.connectNotion(fakeUser, 'project-1', {
          pageUrl: 'https://notion.so/some-page',
        }),
      ).rejects.toThrow('Unable to access this Notion page');
    });
  });

  describe('findAll', () => {
    it('delegates to the service with the current user and project id', async () => {
      resourcesService.findAllForProject.mockResolvedValue([]);

      await controller.findAll(fakeUser, 'project-1');

      expect(resourcesService.findAllForProject).toHaveBeenCalledWith(
        'user-1',
        'project-1',
      );
    });
  });

  describe('findOne', () => {
    it('delegates to the service with the current user, project id and resource id', async () => {
      resourcesService.findOne.mockResolvedValue(
        undefined as unknown as Awaited<
          ReturnType<ResourcesService['findOne']>
        >,
      );

      await controller.findOne(fakeUser, 'project-1', 'resource-1');

      expect(resourcesService.findOne).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'resource-1',
      );
    });
  });

  describe('remove', () => {
    it('delegates to the service with the current user, project id, and resource id', async () => {
      resourcesService.delete.mockResolvedValue(undefined);

      await controller.remove(fakeUser, 'project-1', 'resource-1');

      expect(resourcesService.delete).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'resource-1',
      );
    });
  });
});
