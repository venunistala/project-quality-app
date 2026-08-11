ALTER TABLE "releases" RENAME COLUMN "version" TO "release_label";--> statement-breakpoint
ALTER INDEX "releases_version_key" RENAME TO "releases_release_label_key";--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
