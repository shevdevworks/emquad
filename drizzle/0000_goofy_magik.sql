CREATE TABLE "posters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"phrase" text NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"in_gallery" boolean DEFAULT false NOT NULL,
	CONSTRAINT "posters_code_unique" UNIQUE("code")
);
