// Configure Elements
const statusesContainer = document.getElementById("statuses");
const statusTemplate = document.getElementById("statusTemplate").innerHTML;

// Helper: Get query string parameter (borrowed from https://davidwalsh.name/query-string-javascript)
function getUrlParameter(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
  var results = regex.exec(location.search);
  return results === null
    ? ""
    : decodeURIComponent(results[1].replace(/\+/g, " "));
}

// Helper: Interpololate a HTML template element as a JavaScript template literal (borrowed from: https://gomakethings.com/html-templates-with-vanilla-javascript/)
function interpolate(str, params) {
  let names = Object.keys(params);
  let vals = Object.values(params);
  return new Function(...names, `return \`${str}\`;`)(...vals);
}

// Helper: Render custom emojis
function customEmojis(str, emojis = []) {
  var emojiMap = {};

  emojis.forEach((emoji) => {
    emojiMap[":" + emoji.shortcode + ":"] =
      '<img src="' + emoji.url + '" draggable="false" class="emoji"/>';
  });

  emojifiedString = str.replace(/:[\d+_a-z-]+:/g, function (m) {
    return emojiMap[m];
  });

  return emojifiedString;
}

// Set event source
const evtSource = new EventSource(
  "https://corsproxy.io/?https%3A%2F%2Ffedi.buzz%2Fapi%2Fv1%2Fstreaming%2Fpublic"
);

// Main streaming function
function beginStreaming(filter, lang) {
  let anchor = document.querySelector("#anchor");

  evtSource.addEventListener("update", (event) => {
    // If filter is set to the input field, use that one
    if (document.getElementById("filter").value) {
      filter = document.getElementById("filter").value.toLowerCase();
    }

    var status = JSON.parse(event.data);
    if (status.reblog || !status.id) return; // Skip boosts or statuses without ID

    // Constantly calculate the height in total of the avatars inside statuses div
    var contentHeight = 0;

    document.querySelectorAll(".avatar").forEach((avatar) => {
      contentHeight += avatar.offsetHeight;
    });

    // When height of content reach the height of the window, scroll to bottom but not until it's double over the window height
    if (
      contentHeight >= window.innerHeight - 400 &&
      contentHeight <= window.innerHeight * 1.5
    ) {
      statusesContainer.scrollTop = statusesContainer.scrollHeight;
    }

    // Remove HTML tags and URLs from status content for search purposes
    var statusText = status.content
      .replace(/(<([^>]+)>)/g, "")
      .replace(/(?:https?|ftp):\/\/[\n\S]+/g, "");

    // Check for filter text in content & that language is either set to "any" or a match
    if (
      statusText.toLowerCase().includes(filter) &&
      (lang.toLowerCase() == "any" ||
        status.language.toLowerCase().includes(lang.toLowerCase()))
    ) {
      // Emojify content
      status.content = customEmojis(status.content, status.emojis);

      // Hilight filtered text if filter is at least 3 letters
      if (filter && filter.length >= 3) {
        status.content = status.content.replace(
          new RegExp(filter, "gi"),
          '<span class="hilight">$&</span>'
        );
      }

      // Emojify display name
      status.account.display_name = customEmojis(
        status.account.display_name,
        status.account.emojis
      );

      // Convert created_at to local timestamp
      status.created_at = new Date(status.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Reply indicator
      if (status.in_reply_to_id != null) {
        // Prepend ↰ to status
        status.content =
          '<span class="text-neutral reply-indicator" style="float: left; margin-right: 4px;">↰</span> ' +
          status.content;
      }

      // Render images
      // if (status.media_attachments.length != 0) { status.media_attachments = `<div class="attachments attachments-` + status.media_attachments.length + `">` + status.media_attachments.reduce((updated, current) => updated.concat(`<img src="${current.preview_url}" class="attachment"/>`), '') + '</div>'}

      // Show only image placeholder
      if (status.media_attachments.length != 0) {
        status.media_attachments = `<span class="text-neutral">[image]</span>`;
      }
      statusHTML = interpolate(statusTemplate, {
        status,
      });
      anchor.insertAdjacentHTML("beforebegin", statusHTML);
    }
  });

  // Update status if it gets updated
  evtSource.addEventListener("status.update", (event) => {
    var status = JSON.parse(event.data);

    if (!document.querySelector(`[data-id="${status.id}"]`)) return; // Status isn't rendered (filtered out or just too old)
    console.log(status.id);
    // Remove divs
    document
      .querySelectorAll(`div[data-id="${status.id}"]`)
      .forEach((el) => el.remove());

    // Replace anchor tag with new HTML
    const anchor = document.querySelector(`a[data-id="${status.id}"]`);

    anchor.outerHTML = statusToHtml(status);
  });

  // Remove status if it's deleted
  evtSource.addEventListener("delete", (event) => {
    document
      .querySelectorAll(`[data-id="${event.data}"]`)
      .forEach((el) => el.remove());
  });
}

// If statuses div is not scrolled to bottom, show button, otherwise hide
statusesContainer.addEventListener("scroll", function (event) {
  // Add safe zone to bottom of div
  if (
    statusesContainer.scrollTop <
    statusesContainer.scrollHeight - statusesContainer.offsetHeight - 200
  ) {
    document.getElementById("catch-up").hidden = false;
  } else {
    document.getElementById("catch-up").hidden = true;
  }
});

// Add click event to scroll to bottom of div statuses
document.getElementById("catch-up").addEventListener("click", function (event) {
  statusesContainer.scrollTop = statusesContainer.scrollHeight;

  // Hide button
  document.getElementById("catch-up").hidden = true;
});

filterText = document.getElementById("filter").value.toLowerCase();

// When page is loaded, check for query string, otherwise present input
window.addEventListener("load", function (event) {
  // If lang is set, select the current lang in the dropdown and set it to the button
  if (getUrlParameter("lang")) {
    document.getElementById("lang").value = getUrlParameter("lang");
  }

  // Grab URL parameters if they exist
  var filter = getUrlParameter("filter") ? getUrlParameter("filter") : false;
  var lang = getUrlParameter("lang") ? getUrlParameter("lang") : "any";

  if (filter) {
    document.getElementById("filter").value = filter;
    localStorage["lastLang"] = lang;

    document.getElementById("filter-now").innerHTML =
      'Now filtering: <span class="hilight">' + filter + "</span>";
  } else {
    // Stream by default without a filter
    var filter = "";

    if (localStorage["lastLang"]) {
      document.getElementById("lang").value = localStorage["lastLang"];
    }
  }

  // If lang, add it to the button
  if (lang != "any") {
    document.getElementById("filter-now").innerHTML +=
      ' <span class="text-neutral">(' + lang + ")</span>";
  }

  beginStreaming(filter, lang);
});

// Filter on type without enter, add with push state to URL
document.getElementById("filter").addEventListener("keyup", function (event) {
  // Require at least 3 letters
  if (document.getElementById("filter").value.length < 3) {
    return;
  }

  setTimeout(function () {
    var filter = document.getElementById("filter").value.toLowerCase();
    var lang = document.getElementById("lang").value.toLowerCase();

    // Update placeholder
    document.getElementById("filter-now").innerHTML =
      'Now filtering: <span class="hilight">' + filter + "</span>";

    // Push state to URL
    history.pushState(null, null, "?filter=" + filter + "&lang=" + lang);
    console.log("Filtering for: " + filter);
  }, 500);

  setTimeout(function () {
    filter = document.getElementById("filter").value.toLowerCase();
    lang = document.getElementById("lang").value.toLowerCase();

    console.log("Updated filter: " + filter);
  }, 800);
});

// Do the same when selecting language
document.getElementById("lang").addEventListener("change", function (event) {
  var lang = document.getElementById("lang").value.toLowerCase();
  console.log("Changed language to: " + lang);

  filter = document.getElementById("filter").value.toLowerCase();

  // Change only lang in the address bar, leave filter as is
  history.pushState(null, null, "?filter=" + filter + "&lang=" + lang);

  lang = document.getElementById("lang").value.toLowerCase();
  console.log("Updated language: " + lang);

  // If lang, add it to the button
  if (lang != "any") {
    document.getElementById("filter-now").innerHTML +=
      ' <span class="text-neutral">(' + lang + ")</span>";
  } else {
    document.getElementById("filter-now").innerHTML =
      'Now filtering: <span class="hilight">' + filter + "</span>";
  }

  setTimeout(function () {
    filter = document.getElementById("filter").value.toLowerCase();
    lang = document.getElementById("lang").value.toLowerCase();

    console.log("Updated filter: " + filter);
    console.log("Updated language: " + lang);
  }, 800);
});

// Accessible open modal when pressing filter-now button
document
  .getElementById("filter-now")
  .addEventListener("click", function (event) {
    // Set display to modal overlay
    document.getElementById("modal-overlay").style.display = "block";

    // Set display to modal
    document.getElementById("modal").style.display = "flex";

    // Focus to filter input
    document.getElementById("filter").focus();

    // Set aria-hidden to false
    document.getElementById("modal").setAttribute("aria-hidden", "false");
  });

// Close modal with esc and modal-close button
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    document.getElementById("modal-overlay").style.display = "none";
    document.getElementById("modal").style.display = "none";
    document.getElementById("modal").setAttribute("aria-hidden", "true");

    // Move focus back to filter button
    document.getElementById("filter-now").focus();
  }
});

document
  .getElementById("modal-close")
  .addEventListener("click", function (event) {
    document.getElementById("modal-overlay").style.display = "none";
    document.getElementById("modal").style.display = "none";
    document.getElementById("modal").setAttribute("aria-hidden", "true");

    // Move focus back to filter button
    document.getElementById("filter-now").focus();
  });

// Reset button
document.getElementById("reset").addEventListener("click", function (event) {
  document.getElementById("filter").value = "";
  document.getElementById("lang").value = "any";
  document.getElementById("filter-now").innerHTML = "Filter";
  document.getElementById("modal-overlay").style.display = "none";
  document.getElementById("modal").style.display = "none";
  document.getElementById("modal").setAttribute("aria-hidden", "true");

  // Move focus back to filter button
  document.getElementById("filter-now").focus();

  // Push state to URL
  history.pushState(null, null, "?filter=&lang=any");

  // Reload page
  location.reload();
});

// Hide modal when clicking outside of it
document
  .getElementById("modal-overlay")
  .addEventListener("click", function (event) {
    document.getElementById("modal-overlay").style.display = "none";
    document.getElementById("modal").style.display = "none";
    document.getElementById("modal").setAttribute("aria-hidden", "true");

    // Move focus back to filter button
    document.getElementById("filter-now").focus();
  });
