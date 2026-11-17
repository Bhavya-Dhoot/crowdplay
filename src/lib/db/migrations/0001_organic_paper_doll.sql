DROP INDEX "ideas_round_idx";--> statement-breakpoint
DROP INDEX "ideas_user_idx";--> statement-breakpoint
DROP INDEX "receipts_user_idx";--> statement-breakpoint
DROP INDEX "receipts_show_idx";--> statement-breakpoint
CREATE INDEX "engine_state_deadline_idx" ON "engine_state" USING btree ("phase_ends_at") WHERE "engine_state"."phase_ends_at" is not null;--> statement-breakpoint
CREATE INDEX "ideas_round_user_idx" ON "ideas" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE INDEX "receipts_show_type_user_idx" ON "receipts" USING btree ("show_id","type","user_id");