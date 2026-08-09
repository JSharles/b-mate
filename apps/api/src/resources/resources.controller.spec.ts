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
  status: 'processing',
  title: 'Architecture overview',
  originalFileKey: 'resources/project-1/a.pdf',
  originalFileName: 'Architecture overview.pdf',
  originalFileMimeType: 'application/pdf',
  originalFileSizeBytes: 1024,
  notionPageUrl: null,
  failureReason: null,
  anthropicBatchId: 'batch_123',
  addedByUserId: 'user-1',
  publishedAt: null,
  publishedByUserId: null,
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
      | 'publish'
      | 'delete'
      | 'approveCategory'
      | 'rejectCategory'
    >
  >;
  let controller: ResourcesController;

  beforeEach(() => {
    resourcesService = {
      createFromUpload: jest.fn(),
      createFromNotion: jest.fn(),
      findAllForProject: jest.fn(),
      findOne: jest.fn(),
      publish: jest.fn(),
      delete: jest.fn(),
      approveCategory: jest.fn(),
      rejectCategory: jest.fn(),
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
    it('delegates to the service with the current user, project id, and locale', async () => {
      resourcesService.findAllForProject.mockResolvedValue([]);

      await controller.findAll(fakeUser, 'project-1', 'fr');

      expect(resourcesService.findAllForProject).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'fr',
      );
    });

    it('defaults to the app default locale when none is given', async () => {
      resourcesService.findAllForProject.mockResolvedValue([]);

      await controller.findAll(fakeUser, 'project-1', undefined);

      expect(resourcesService.findAllForProject).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'fr',
      );
    });
  });

  describe('findOne', () => {
    it('delegates to the service with the current user, project id, resource id, and locale', async () => {
      resourcesService.findOne.mockResolvedValue(
        undefined as unknown as Awaited<
          ReturnType<ResourcesService['findOne']>
        >,
      );

      await controller.findOne(fakeUser, 'project-1', 'resource-1', 'en');

      expect(resourcesService.findOne).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'resource-1',
        'en',
      );
    });
  });

  describe('publish', () => {
    it('delegates to the service with the current user, project id, and resource id', async () => {
      resourcesService.publish.mockResolvedValue({
        ...fakeResource,
        status: 'published',
      });

      const result = await controller.publish(
        fakeUser,
        'project-1',
        'resource-1',
      );

      expect(resourcesService.publish).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'resource-1',
      );
      expect(result.status).toBe('published');
    });

    it('propagates a rejection when the resource is not ready for review', async () => {
      resourcesService.publish.mockRejectedValue(
        new Error('Only a resource ready for review can be published'),
      );

      await expect(
        controller.publish(fakeUser, 'project-1', 'resource-1'),
      ).rejects.toThrow('Only a resource ready for review can be published');
    });
  });

  describe('approveCategory', () => {
    it('delegates to the service with the current user, project id, resource id, and category assignment id', async () => {
      resourcesService.approveCategory.mockResolvedValue(undefined);

      await controller.approveCategory(
        fakeUser,
        'project-1',
        'resource-1',
        'assignment-1',
      );

      expect(resourcesService.approveCategory).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'resource-1',
        'assignment-1',
      );
    });

    it('propagates a rejection when the assignment is not currently proposed', async () => {
      resourcesService.approveCategory.mockRejectedValue(
        new Error('This category has already been approved or rejected'),
      );

      await expect(
        controller.approveCategory(
          fakeUser,
          'project-1',
          'resource-1',
          'assignment-1',
        ),
      ).rejects.toThrow('This category has already been approved or rejected');
    });
  });

  describe('rejectCategory', () => {
    it('delegates to the service with the current user, project id, resource id, and category assignment id', async () => {
      resourcesService.rejectCategory.mockResolvedValue(undefined);

      await controller.rejectCategory(
        fakeUser,
        'project-1',
        'resource-1',
        'assignment-1',
      );

      expect(resourcesService.rejectCategory).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'resource-1',
        'assignment-1',
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
