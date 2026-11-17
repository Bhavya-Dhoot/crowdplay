import { describe, expect, it } from "vitest";
import { ticketSeats, TICKET_CAP } from "@/components/screen/lobby";
import { joinTickDue } from "@/components/screen/sound";

describe("ticketSeats", () => {
  it("lists the newest seat first", () => {
    expect(ticketSeats(3)).toEqual([3, 2, 1]);
  });

  it("is capped, keeping the newest seats", () => {
    const seats = ticketSeats(40);
    expect(seats.length).toBe(TICKET_CAP);
    expect(seats[0]).toBe(40);
    expect(seats[TICKET_CAP - 1]).toBe(40 - TICKET_CAP + 1);
  });

  it("is empty for an empty room and for junk", () => {
    expect(ticketSeats(0)).toEqual([]);
    expect(ticketSeats(-4)).toEqual([]);
    expect(ticketSeats(Number.NaN)).toEqual([]);
  });
});

describe("joinTickDue", () => {
  it("ticks when the head-count grows in the lobby", () => {
    expect(joinTickDue("LOBBY", 4, 3)).toBe(true);
  });

  it("stays quiet on the first reading, when nobody joined, and outside the lobby", () => {
    expect(joinTickDue("LOBBY", 4, null)).toBe(false);
    expect(joinTickDue("LOBBY", 3, 3)).toBe(false);
    expect(joinTickDue("LOBBY", 2, 3)).toBe(false);
    expect(joinTickDue("STORM", 5, 4)).toBe(false);
  });
});
