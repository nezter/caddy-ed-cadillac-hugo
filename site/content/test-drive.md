---
title: "Book a Test Drive"
subtitle: "Half an hour in the car, on your own route"
description: "Request a test drive in any Cadillac in current Caddy Ed inventory. Pick the car, pick a day, and Ed will confirm the time."
date: 2026-09-26
scripts:
  - appointment-scheduler.js
  - schedulingCalendar.js
---

Pick the car, tell me when suits you, and I'll come back with a confirmed time.
There is one of me here, so I answer these myself — usually the same day.

If you would rather just talk it through, the number is in the header on every
page, or use the [contact page](/contact/). If you are after a number rather
than a drive, tell me the model and your budget and I will tell you what I can
actually get you — including vehicles I can source that are not in the list.


## Pick a Time

The scheduler below checks real availability and books straight into the
calendar. Choose a day, pick a slot, and it confirms before you leave.

<div class="scheduling-calendar" data-calendar="test-drive">
  <div class="calendar-container"></div>
  <div class="time-slots"></div>
</div>

<div id="appointment-scheduler">
  <form id="appointment-form" class="form" method="post" action="/api/appointments">
    <div class="form-grid form-grid-2">
      <div class="form-field">
        <label for="appointment-type">Appointment type</label>
        <select id="appointment-type" name="type" required>
          <option value="test-drive">Test drive</option>
          <option value="consultation">Consultation</option>
          <option value="trade-appraisal">Trade appraisal</option>
        </select>
      </div>
      <div class="form-field">
        <label for="sales-rep-selector">Sales representative</label>
        <select id="sales-rep-selector" name="rep" required>
          <option value="caddy-ed">Caddy Ed</option>
        </select>
      </div>
      <div class="form-field">
        <label for="appointment-date">Preferred date</label>
        <input type="date" id="appointment-date" name="date" required>
      </div>
      <div class="form-field">
        <label for="appointment-time">Preferred time</label>
        <select id="appointment-time" name="time" required>
          <option value="">Select a time</option>
        </select>
      </div>
    </div>
    <div id="time-availability" class="time-availability" aria-live="polite"></div>
    <div class="form-field">
      <label for="appointment-name">Name <span aria-hidden="true">*</span></label>
      <input type="text" id="appointment-name" name="name" required autocomplete="name">
    </div>
    <div class="form-field">
      <label for="appointment-email">Email <span aria-hidden="true">*</span></label>
      <input type="email" id="appointment-email" name="email" required autocomplete="email">
    </div>
    <div class="form-field">
      <label for="appointment-phone">Phone <span aria-hidden="true">*</span></label>
      <input type="tel" id="appointment-phone" name="phone" required autocomplete="tel">
    </div>
    <button type="submit" class="btn btn-primary">Request this appointment</button>
  </form>
</div>

## How it works

- **You send a day and a rough time.** It is a request, not a locked slot.
- **I confirm the exact time** by phone or email, and check the car is still
  here. Inventory moves.
- **We drive.** Around the block, or out on the highway if you want to know
  what the seats are like at speed. If you have a trade, bring it and I will
  give you a real number against this one on the same drive.

Every car on the [inventory page](/inventory/) can be driven, including the
pre-owned and certified ones. If something has just been taken, say so in the
comments and I will find the nearest equivalent.
