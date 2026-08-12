UPDATE "transactions"
SET "image_urls" = jsonb_build_array("image_url")
WHERE "image_url" IS NOT NULL AND "image_urls" IS NULL;