import { unauthenticated } from "../shopify.server.js";

const MAX_REVIEW_MEDIA = 5;
const PHOTO_URL_POLL_ATTEMPTS = 8;
const PHOTO_URL_POLL_DELAY_MS = 750;
const VALID_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VALID_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const getFileUrl = (file) => {
  if (file?.image?.url) return file.image.url;
  if (file?.sources?.[0]?.url) return file.sources[0].url;
  if (file?.url) return file.url;
  return null;
};

const getMediaType = (file) =>
  VALID_VIDEO_TYPES.has(file.type) ? "VIDEO" : "IMAGE";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getReviewPhotoFiles = async (admin, ids) => {
  if (!ids.length) return [];

  const response = await admin.graphql(
    `#graphql
    query GetReviewPhotoFiles($ids: [ID!]!) {
      nodes(ids: $ids) {
        id
        ... on MediaImage {
          alt
          image {
            url
          }
        }
        ... on GenericFile {
          alt
          url
        }
        ... on Video {
          alt
          sources {
            url
            mimeType
          }
        }
      }
    }`,
    {
      variables: { ids },
    },
  );
  const json = await response.json();

  return json.data?.nodes?.filter(Boolean) || [];
};

const waitForReviewPhotoUrls = async (admin, files) => {
  let resolvedFiles = files;

  for (let attempt = 0; attempt < PHOTO_URL_POLL_ATTEMPTS; attempt += 1) {
    const missingUrlIds = resolvedFiles
      .filter((file) => file?.id && !getFileUrl(file))
      .map((file) => file.id);

    if (!missingUrlIds.length) {
      return resolvedFiles;
    }

    await wait(PHOTO_URL_POLL_DELAY_MS);

    const refreshedFiles = await getReviewPhotoFiles(admin, missingUrlIds);
    const refreshedById = new Map(
      refreshedFiles.map((file) => [file.id, file]),
    );

    resolvedFiles = resolvedFiles.map((file) =>
      refreshedById.get(file.id) || file,
    );
  }

  return resolvedFiles;
};

export const getValidReviewPhotos = (files) =>
  files
    .filter((file) => file && file.size > 0)
    .filter((file) => VALID_IMAGE_TYPES.has(file.type) || VALID_VIDEO_TYPES.has(file.type))
    .slice(0, MAX_REVIEW_MEDIA);

export const uploadReviewPhotosToShopify = async ({ files, shop, alt }) => {
  const validFiles = getValidReviewPhotos(files);

  if (!validFiles.length) {
    return [];
  }

  const { admin } = await unauthenticated.admin(shop);
  const stagedResponse = await admin.graphql(
    `#graphql
    mutation CreateReviewPhotoUploads($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: validFiles.map((file) => {
          const mediaType = getMediaType(file);

          return {
            filename: file.name,
            httpMethod: "POST",
            mimeType: file.type,
            resource: mediaType === "VIDEO" ? "VIDEO" : "FILE",
            ...(mediaType === "VIDEO" ? { fileSize: String(file.size) } : {}),
          };
        }),
      },
    },
  );
  const stagedJson = await stagedResponse.json();
  const stagedErrors = stagedJson.data?.stagedUploadsCreate?.userErrors || [];

  if (stagedErrors.length) {
    throw new Error(stagedErrors.map((error) => error.message).join(", "));
  }

  const stagedTargets = stagedJson.data?.stagedUploadsCreate?.stagedTargets || [];

  await Promise.all(
    stagedTargets.map(async (target, index) => {
      const formData = new FormData();

      target.parameters.forEach(({ name, value }) => {
        formData.append(name, value);
      });
      formData.append("file", validFiles[index]);

      const uploadResponse = await fetch(target.url, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Media upload failed for ${validFiles[index].name}`);
      }
    }),
  );

  const fileCreateResponse = await admin.graphql(
    `#graphql
    mutation CreateReviewPhotoFiles($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          ... on MediaImage {
            image {
              url
            }
          }
          ... on GenericFile {
            url
          }
          ... on Video {
            sources {
              url
              mimeType
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        files: stagedTargets.map((target, index) => ({
          alt,
          contentType: getMediaType(validFiles[index]),
          originalSource: target.resourceUrl,
        })),
      },
    },
  );
  const fileCreateJson = await fileCreateResponse.json();
  const fileCreateErrors = fileCreateJson.data?.fileCreate?.userErrors || [];

  if (fileCreateErrors.length) {
    throw new Error(fileCreateErrors.map((error) => error.message).join(", "));
  }

  const createdFiles = fileCreateJson.data?.fileCreate?.files || [];
  const resolvedFiles = await waitForReviewPhotoUrls(admin, createdFiles);

  return resolvedFiles.map((file, index) => ({
    alt: file.alt || alt,
    // Shopify can return a Video before its sources finish processing. Keep
    // the type from the original browser File instead of inferring it here.
    mediaType: getMediaType(validFiles[index]),
    shopifyFileId: file.id,
    url: getFileUrl(file),
  }));
};
