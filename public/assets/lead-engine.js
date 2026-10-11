(function () {
  "use strict";

  // Provider-neutral events. No form fields, enquiry text or personal data.
  // Listen to kwba:analytics or provide window.kwbaAnalytics(event).
  function track(name, properties) {
    var event = {
      name: name,
      properties: properties || {},
      timestamp: new Date().toISOString(),
    };
    window.dispatchEvent(new CustomEvent("kwba:analytics", { detail: event }));
    if (typeof window.kwbaAnalytics === "function") {
      try {
        window.kwbaAnalytics(event);
      } catch (_) {
        /* Tracking must never block the page. */
      }
    }
  }
  document.querySelectorAll("[data-event]").forEach(function (link) {
    link.addEventListener("click", function () {
      track(link.dataset.event);
    });
  });
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
  var menu = document.getElementById("site-nav");
  var toggle = document.querySelector(".menu-toggle");
  function closeMenu() {
    if (!menu || !toggle) return;
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
  }
  if (menu && toggle) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute(
        "aria-label",
        open ? "Close navigation" : "Open navigation",
      );
    });
    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menu.classList.contains("open")) {
        closeMenu();
        toggle.focus();
      }
    });
    window
      .matchMedia("(min-width: 761px)")
      .addEventListener("change", closeMenu);
  }
  if ("IntersectionObserver" in window) {
    ["pricing", "results"].forEach(function (id) {
      var section = document.getElementById(id);
      if (!section) return;
      var observer = new IntersectionObserver(
        function (entries) {
          if (
            entries.some(function (entry) {
              return entry.isIntersecting;
            })
          ) {
            track(id === "pricing" ? "pricing_viewed" : "results_viewed");
            observer.disconnect();
          }
        },
        { threshold: 0.2 },
      );
      observer.observe(section);
    });
    var booking = document.getElementById("book-demo");
    var mobileCTA = document.querySelector(".mobile-cta");
    if (booking && mobileCTA)
      new IntersectionObserver(function (entries) {
        mobileCTA.classList.toggle("at-form", entries[0].isIntersecting);
      }).observe(booking);
  }

  var scenarios = {
    plumbing: {
      enquiry: "“My boiler needs a repair. Do you cover Milton Keynes?”",
      service: "Boiler repair",
      reply:
        "Thanks for getting in touch. What’s your postcode and when would you like us to contact you?",
      details: "Boiler repair · MK9 · Prefers an afternoon visit",
    },
    electrical: {
      enquiry: "“Could I get a quote for adding sockets in my home office?”",
      service: "Socket installation",
      reply:
        "Happy to help with your enquiry. How many sockets do you need, and what’s your postcode?",
      details: "Two additional sockets · MK10 · Quote requested",
    },
    roofing: {
      enquiry: "“Some roof tiles need replacing. Can you give me a quote?”",
      service: "Roof repair",
      reply:
        "Thanks for the enquiry. Where is the property, and can you share details of the tiles that need attention?",
      details: "Roof tile repair · MK12 · Site visit requested",
    },
  };
  var next = document.getElementById("demo-next");
  if (next) {
    var scenarioSelect = document.getElementById("demo-scenario");
    var reset = document.getElementById("demo-reset");
    var output = document.getElementById("demo-output");
    var progress = Array.from(document.querySelectorAll("#demo-progress li"));
    var step = 0;
    function renderStep() {
      var scenario = scenarios[scenarioSelect.value];
      var stages = [
        [
          "ENQUIRY",
          "A customer gets in touch.",
          "Start the sample to see how a response, qualification and follow-up can lead towards a booking.",
        ],
        ["RESPONSE", "A helpful first reply.", scenario.reply],
        [
          "QUALIFICATION",
          "The important details, collected.",
          scenario.details +
            ". The agreed handover rules determine whether your team needs to step in.",
        ],
        [
          "FOLLOW-UP",
          "The enquiry gets a next step.",
          "Sample reminder: “Would you like to arrange a visit? Let us know a suitable time.” No real SMS or email is sent.",
        ],
        [
          "BOOKING",
          "An appointment moves into view.",
          "Sample appointment: Tuesday, 2 pm. This illustrates an agreed calendar connection; no appointment has been reserved.",
        ],
        [
          "PIPELINE",
          "Your team can see the whole journey.",
          scenario.service +
            " → qualified → sample booking. In a live pilot, outcomes are tracked against your baseline.",
        ],
      ];
      output.replaceChildren();
      [
        ["span", "STEP 0" + (step + 1) + " / " + stages[step][0], "eyebrow"],
        ["h3", stages[step][1]],
        ["p", stages[step][2]],
      ].forEach(function (item) {
        var element = document.createElement(item[0]);
        element.textContent = item[1];
        if (item[2]) element.className = item[2];
        output.appendChild(element);
      });
      progress.forEach(function (item, index) {
        item.classList.toggle("complete", index < step);
        if (index === step) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
      next.textContent =
        step === 0
          ? "Start sample demo →"
          : step === 5
            ? "Run sample again ↻"
            : "Next: " + stages[step + 1][0].toLowerCase() + " →";
      reset.hidden = step === 0;
    }
    function restart() {
      step = 0;
      renderStep();
    }
    next.addEventListener("click", function () {
      if (step === 5) {
        restart();
        return;
      }
      if (step === 0) track("demo_started", { scenario: scenarioSelect.value });
      step += 1;
      renderStep();
      if (step === 5)
        track("demo_completed", { scenario: scenarioSelect.value });
    });
    reset.addEventListener("click", restart);
    scenarioSelect.addEventListener("change", function () {
      document.getElementById("sample-enquiry").textContent =
        scenarios[scenarioSelect.value].enquiry;
      restart();
    });
  }

  var calculator = document.getElementById("roi-form");
  if (calculator)
    calculator.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!calculator.reportValidity()) return;
      var values = new FormData(calculator);
      var enquiries = Number(values.get("enquiries"));
      var jobValue = Number(values.get("value"));
      var missed = Number(values.get("missed"));
      var conversion = Number(values.get("conversion"));
      if (![enquiries, jobValue, missed, conversion].every(Number.isFinite))
        return;
      var missedEnquiries = (enquiries * missed) / 100;
      var jobs = (missedEnquiries * conversion) / 100;
      document.getElementById("roi-output").textContent = new Intl.NumberFormat(
        "en-GB",
        { style: "currency", currency: "GBP", maximumFractionDigits: 0 },
      ).format(jobs * jobValue);
      var number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
      document.getElementById("roi-jobs").textContent =
        "Based on " +
        number.format(missedEnquiries) +
        " missed enquiries and " +
        number.format(jobs) +
        " potential jobs.";
      track("roi_calculated");
    });

  var form = document.getElementById("demo-request");
  if (form) {
    var started = false;
    form.addEventListener("input", function () {
      if (!started) {
        started = true;
        track("contact_started");
      }
    });
    var submitting = false;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (submitting || !form.reportValidity()) return;
      var data = new FormData(form);
      if (data.get("website")) return;
      var button = document.getElementById("request-submit");
      var status = document.getElementById("request-status");
      var payload = {
        bizName: String(data.get("bizName")).trim(),
        contactName: String(data.get("contactName")).trim(),
        contactEmail: String(data.get("contactEmail")).trim(),
        cEmail: String(data.get("contactEmail")).trim(),
        industry: data.get("industry"),
        message: String(data.get("message") || "").trim(),
        service: "KWBA Lead Engine",
        briefType: "lead-engine-demo",
        source: document.body.classList.contains("contact-page")
          ? "lead-engine-contact"
          : "lead-engine-homepage",
        timestamp: new Date().toISOString(),
      };
      if (!payload.bizName || !payload.contactName || !payload.contactEmail) {
        status.textContent = "Please enter your name, business name and email.";
        status.focus();
        return;
      }
      submitting = true;
      button.disabled = true;
      button.textContent = "Sending your request…";
      status.textContent = "";
      var controller = new AbortController();
      var timeout = setTimeout(function () {
        controller.abort();
      }, 30000);
      try {
        var response = await fetch((window.API_BASE || "") + "/public-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("request failed");
        var result = await response.json();
        if (!Number.isInteger(result.id))
          throw new Error("request not confirmed");
        status.textContent =
          "Request received (reference " +
          result.id +
          "). We’ll email you to arrange a time. Your appointment is not booked yet.";
        button.textContent = "Request received ✓";
        form
          .querySelectorAll("input, select, textarea")
          .forEach(function (field) {
            field.disabled = true;
          });
        track("contact_submitted", { source: payload.source });
      } catch (error) {
        status.textContent =
          error.name === "AbortError"
            ? "The server took too long to confirm. Your request may have arrived; email hello@kwba-agency.com to check before submitting again."
            : "We couldn’t confirm your request. Please try again or email hello@kwba-agency.com.";
        button.disabled = false;
        button.textContent = "Book a Free Demo ↗";
        submitting = false;
      } finally {
        clearTimeout(timeout);
        status.focus();
      }
    });
  }
})();
