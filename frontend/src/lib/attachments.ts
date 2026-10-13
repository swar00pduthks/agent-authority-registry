import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";

const MAX_BYTES = 10 * 1024 * 1024;

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Sends any attached file to the agent as a base64 `file` content block.
 * For large files, upload to your own storage here and send a URL instead.
 */
export const fileAttachmentAdapter: AttachmentAdapter = {
  accept: ".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.json,image/*",

  async add({ file }): Promise<PendingAttachment> {
    if (file.size > MAX_BYTES) {
      throw new Error(`${file.name} is larger than 10 MB.`);
    }
    return {
      id: crypto.randomUUID(),
      type: file.type.startsWith("image/") ? "image" : "file",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  },

  async send(attachment): Promise<CompleteAttachment> {
    const data = await toBase64(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          data,
          mimeType: attachment.contentType || "application/octet-stream",
          filename: attachment.name,
        },
      ],
    };
  },

  async remove() {},
};
