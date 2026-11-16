CREATE TABLE "engine_state" (
	"room_id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"round_no" integer DEFAULT 0 NOT NULL,
	"phase" text DEFAULT 'LOBBY' NOT NULL,
	"phase_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phase_ends_at" timestamp with time zone,
	"paused_remaining_ms" integer,
	"version" bigint DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text,
	"type" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"client_msg_id" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"cluster_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "options" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"slot" text,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"source_idea_ids" jsonb NOT NULL,
	"supporters" integer DEFAULT 0 NOT NULL,
	"vetoed" boolean DEFAULT false NOT NULL,
	"boosted" boolean DEFAULT false NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	CONSTRAINT "participants_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"show_id" text NOT NULL,
	"round_id" text NOT NULL,
	"type" text NOT NULL,
	"option_id" text NOT NULL,
	"idea_id" text NOT NULL,
	"delivered_nexconn" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"host_user_id" text NOT NULL,
	"host_key_hash" text NOT NULL,
	"strict_filter" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"demo_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"round_no" integer NOT NULL,
	"prompt_title" text NOT NULL,
	"prompt_text" text NOT NULL,
	"narrator_options" jsonb NOT NULL,
	"prompt_provider" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"ideas_count" integer DEFAULT 0 NOT NULL,
	"contributors_count" integer DEFAULT 0 NOT NULL,
	"distill_ms" integer,
	"distill_provider" text,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"votes_count" integer DEFAULT 0 NOT NULL,
	"winner_option_id" text,
	"narration" text,
	"narration_provider" text,
	"beat" text,
	"tts_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shows" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"premise" text NOT NULL,
	"preset" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"rounds_total" integer NOT NULL,
	"storm_ms" integer NOT NULL,
	"vote_ms" integer NOT NULL,
	"prompt_ms" integer NOT NULL,
	"reveal_ms" integer NOT NULL,
	"auto_advance" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"story_title" text,
	"story_summary" text DEFAULT '' NOT NULL,
	"story_recap" text,
	"story_tagline" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"nexconn_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"round_id" text NOT NULL,
	"user_id" text NOT NULL,
	"option_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_round_id_user_id_pk" PRIMARY KEY("round_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engine_state" ADD CONSTRAINT "engine_state_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_state" ADD CONSTRAINT "engine_state_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shows" ADD CONSTRAINT "shows_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_room_idx" ON "events" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "ideas_user_msg_uq" ON "ideas" USING btree ("user_id","client_msg_id");--> statement-breakpoint
CREATE INDEX "ideas_round_idx" ON "ideas" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "ideas_user_idx" ON "ideas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "options_round_idx" ON "options" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_once_uq" ON "receipts" USING btree ("user_id","round_id","type","option_id");--> statement-breakpoint
CREATE INDEX "receipts_user_idx" ON "receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "receipts_show_idx" ON "receipts" USING btree ("show_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_uq" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE INDEX "rooms_host_idx" ON "rooms" USING btree ("host_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_show_no_uq" ON "rounds" USING btree ("show_id","round_no");--> statement-breakpoint
CREATE INDEX "shows_room_idx" ON "shows" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "votes_option_idx" ON "votes" USING btree ("option_id");