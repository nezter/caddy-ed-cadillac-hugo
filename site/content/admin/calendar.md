---
title: "Calendar"
description: "One month at a glance: enquiries and booking requests on the day they belong to."
layout: "admin"
scripts:
  - calendar-admin.js
---

<p class="lede">
  Every enquiry and booking request on the day it belongs to. Click a day to
  see who is behind the numbers. The dot counts are the two things that fill
  a month here: new enquiries from the website forms and phone, and the
  test-drive times customers asked for.
</p>

<div id="calendar-admin" class="op-cal" role="region" aria-live="polite">
  <p class="op-cal__loading">Loading the calendar...</p>
</div>

<p class="op-cal__help">
  Days are counted in dealership time. Booking requests come from the same
  queue as <a href="/admin/bookings/">Bookings</a>; enquiries from the same
  leads the <a href="/admin/dashboard/">worklist</a> shows.
</p>
