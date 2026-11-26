import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";
import { cloudinaryRef } from "@/server/media/storage";

const NEON = "postgresql://owner:pw@ep-example-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const base = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54329/epapere_dev",
  BETTER_AUTH_SECRET: "x".repeat(32),
  CRON_SECRET: "y".repeat(32),
  APP_ORIGIN: "http://localhost:3000",
};
const cloudinary = { MEDIA_STORE: "cloudinary", CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "123", CLOUDINARY_API_SECRET: "s3cret" };

describe("media storage configuration", () => {
  it("accepts local media with a local database (default dev setup)", () => {
    expect(parseEnv(base).MEDIA_STORE).toBe("local");
  });

  it("refuses local media with a cloud database (files would be missing for everyone else)", () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: NEON })).toThrow(/local media store needs a local database/);
  });

  it("accepts Cloudinary with a cloud database, locally and on Vercel", () => {
    expect(parseEnv({ ...base, ...cloudinary, DATABASE_URL: NEON }).MEDIA_STORE).toBe("cloudinary");
    expect(parseEnv({ ...base, ...cloudinary, DATABASE_URL: NEON, APP_ENV: "preview", APP_ORIGIN: "https://beta.example.app" }).APP_ENV).toBe("preview");
  });

  it("lists every missing Cloudinary credential", () => {
    expect(() => parseEnv({ ...base, MEDIA_STORE: "cloudinary" })).toThrow(/CLOUDINARY_CLOUD_NAME[\s\S]*CLOUDINARY_API_KEY[\s\S]*CLOUDINARY_API_SECRET/);
  });

  it("never echoes secret values in the error", () => {
    let message = "";
    try {
      parseEnv({ ...base, ...cloudinary, CLOUDINARY_CLOUD_NAME: undefined, DATABASE_URL: NEON, BETTER_AUTH_SECRET: "short-secret" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/BETTER_AUTH_SECRET/);
    expect(message).not.toContain("s3cret");
    expect(message).not.toContain("short-secret");
    expect(message).not.toContain(":pw@");
  });
});

describe("cloudinaryRef", () => {
  const id = "0b7f2c1e-9a4d-4c55-8e21-3f6a1b2c3d4e";

  it("maps a storage key to a public ID without extension plus format", () => {
    expect(cloudinaryRef(`media/question_image/${id}.png`)).toEqual({ publicId: `media/question_image/${id}`, format: "png" });
    expect(cloudinaryRef(`media/teacher_photo/${id}.jpg`).format).toBe("jpg");
  });

  it.each(["../etc/passwd", `media/question_image/${id}.svg`, `media/Question/${id}.png`, `x/question_image/${id}.png`, `media/question_image/${id}.png?x=1`])(
    "rejects unexpected key %s",
    (k) => expect(() => cloudinaryRef(k)).toThrow("invalid storage key"),
  );
});
