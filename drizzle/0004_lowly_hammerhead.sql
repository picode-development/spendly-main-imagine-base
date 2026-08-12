UPDATE "transactions"
SET "image_urls" = (
    SELECT jsonb_agg(
        CASE
            WHEN jsonb_typeof(elem) = 'string' THEN jsonb_build_object('url', elem)
            ELSE elem
        END
    )
    FROM jsonb_array_elements("image_urls") AS elem
)
WHERE "image_urls" IS NOT NULL;