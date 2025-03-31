import { CONFIG } from './config.js';

const API_KEY = CONFIG.api_key;
const CLIENT_ID = CONFIG.client_Id;

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let assignments = []; // hold assignments from canvas calendar


// Helper function to set error messages
function setErrorMessage(message = null) {
    let contentElement = document.getElementById('error-content');
    if (message) {
        contentElement.innerText = message;
        contentElement.style.display = 'block';
    } else {
        contentElement.innerText = '';
        contentElement.style.display = 'none';
    }
}

document.getElementById('authorize_button').style.visibility = 'hidden';
document.getElementById('signout_button').style.visibility = 'hidden';

// Loads google api client library and initializes it
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

// Initializing google api
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    maybeEnableButtons();
}

/**
 * Loads the Google Identity Services (GIS) client for OAuth authentication.
 * Configures token client for requesting access tokens.
 */
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeEnableButtons();
}

/**
 * Enables authentication buttons only after both GAPI and GIS have been initialized.
 * If a stored token exists, it sets the token and automatically fetches events.
 */
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
        const token = localStorage.getItem('google_calendar_token');
        if (token) {
            try {
                const parsedToken = JSON.parse(token);
                gapi.client.setToken(parsedToken);
                document.getElementById('authorize_button').innerText = 'Refresh Assignments';
                document.getElementById('signout_button').style.visibility = 'visible';
                setErrorMessage(); // Clear error on successful token load
                listUpcomingEvents();
            } catch (error) {
                localStorage.removeItem('google_calendar_token');
                setErrorMessage(); // Clear error before rendering empty state
                renderAssignments(assignments); // Show empty state on token error
            }
        } else {
            setErrorMessage(); // Clear error for pre-auth state
            renderAssignments(assignments); // Show pre-auth empty state on load
        }
    }
}

/**
 * Handles user authentication when the "Authorize" button is clicked.
 * Requests an OAuth access token from Google and fetches events if successful.
 * If already authorized, attempts to refresh events with the existing token silently.
 */
async function handleAuthClick() {
    const currentToken = gapi.client.getToken();

    // Callback for token request
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            console.error('Authorization error:', resp);
            setErrorMessage('Authorization failed: ' + resp.error);
            return;
        }
        // Store the new access token
        localStorage.setItem('google_calendar_token', JSON.stringify(gapi.client.getToken()));
        document.getElementById('signout_button').style.visibility = 'visible';
        document.getElementById('authorize_button').innerText = 'Refresh Assignments';
        setErrorMessage(); // Clear any previous error
        await listUpcomingEvents(); // Fetch and render assignments
    };

    if (currentToken === null) {
        // First-time authorization: Prompt for consent
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        // Already authorized: Try using the existing token first
        try {
            setErrorMessage(); // Clear error before attempting refresh
            await listUpcomingEvents();
        } catch (err) {
            if (err.status === 401 || err.status === 403) {
                // Token expired or invalid: Silently request a new one
                tokenClient.requestAccessToken({ prompt: '' }); // No prompt for refresh
            } else {
                console.error('Error fetching events with existing token:', err);
                setErrorMessage('Error refreshing events: ' + err.message);
            }
        }
    }
}

/**
 * User signOut: revokes the OAuth token and clear local storage.
 * Updates the UI to reflect the logged-out state.
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        localStorage.removeItem('google_calendar_token');
        document.getElementById('authorize_button').innerText = 'Authorize Access';
        document.getElementById('signout_button').style.visibility = 'hidden';
        assignments = []; // Clear assignments
        canvasCalendarId = null; // Reset calendar ID
        setErrorMessage(); // Clear any existing error message
        renderAssignments(assignments); // Update UI with pre-auth state
    }
}

export let canvasCalendarId = null;

// Find and store Canvas calendar ID
export async function getCanvasCalendar() {
    try {
        const response = await gapi.client.calendar.calendarList.list();
        const calendar_list = response.result;

        // Case insensitive search for "Canvas"
        const canvasCalendar = calendar_list.items.find(cal =>
            cal.summary.toLowerCase().includes("canvas")
        );

        if (!canvasCalendar) {
            setErrorMessage('No Canvas calendar found. Follow the "Sync steps" instruction above to link your canvas calendar, then authorize access');
            return null;
        }

        // Clear error message if calendar is found
        setErrorMessage(); // Clears the error
        canvasCalendarId = canvasCalendar.id;
        // console.log("Canvas Calendar:", canvasCalendarId);
        return canvasCalendarId;

    } catch (err) {
        setErrorMessage('Error fetching calendar list: ' + err.message);
        return null;
    }
}

const now = new Date();

// For getting assignments from one month behind
const oneMonthAgo = new Date(now);

oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
oneMonthAgo.setDate(1); // Start from the 1st day of the month
oneMonthAgo.setHours(0, 0, 0, 0);

async function listUpcomingEvents() {
    if (!canvasCalendarId) {
        await getCanvasCalendar();
    }
    if (!canvasCalendarId) {
        return; // Error message already set by getCanvasCalendar
    }

    try {
        const request = {
            'calendarId': canvasCalendarId,
            'timeMin': oneMonthAgo.toISOString(), // Start from last month
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 20,
            'orderBy': 'startTime',
        };
        const response = await gapi.client.calendar.events.list(request);
        const events = response.result.items;
        // console.log(events);

        if (!events || events.length === 0) {
            setErrorMessage('No upcoming Canvas events found.');
            assignments = [];
            renderAssignments(assignments);
            return;
        }

        assignments = events.map((event, index) => {
            // Extract course name from title (event summary)
            const courseMatch = event.summary?.match(/\[(.*?)\]/);
            const courseName = courseMatch ? courseMatch[1] : 'Canvas';

            // Trim title (event summary) and get only assignment tittle
            const rawTitle = event.summary || 'Untitled Event';
            const cleanTitle = rawTitle.replace(/\s*\[.*?\]\s*/g, '').trim();

            // Generate default description for Quizz assignments without a description
            const defaultDescription = `This is a quiz for ${courseName}`;
            const description = event.description?.trim() || defaultDescription;


            /**
             * Use full dateTime or convert local UTC midnight to CAT
             *
             * event.end.date => local midnight (UTC+2 for CAT)
             * event.end.dateTime => complete date and time is provided.
            */
            let dueDate;
            if (event.end.date && !event.end.dateTime) {
                const [year, month, day] = event.end.date.split('-');
                dueDate = new Date(year, month - 1, day); // (month - 1): JavaScript's Date constructor uses zero-indexed months
                dueDate.setMinutes(dueDate.getMinutes() - 1); // Reflects 11:59 PM of previous day
            } else {
                dueDate = new Date(event.end.dateTime); // Use directly if full date-time provided
            }

            return {
                id: index,
                title: cleanTitle,
                dueDate: dueDate,
                description: description,
                course: courseName
            };
        });

        setErrorMessage(); // Clear error on successful fetch
        renderAssignments(assignments);
    } catch (err) {
        setErrorMessage('Error fetching events: ' + err.message);
        console.error('Event fetch error:', err);
        throw err; // Re-throw to catch in handleAuthClick
    }
}

// Function to calculate days until due date
function getDaysUntil(dueDate) {
    const now = new Date();
    const diffTime = dueDate - now;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // If the due date is today but has already passed, mark it as overdue
    if (diffDays === 0 && now > dueDate) {
        return -1; // Ensures it shows "Already due"
    }

    return diffDays;
}


// get countdown class - check the purpose of these in css stylesheet
function getCountdownClass(days) {
    if (days < 0) return 'overdue';
    if (days <= 2) return 'urgent';
    if (days <= 3) return 'warning';
    return 'safe';
}

// Function to format date
function formatDate(date) {
    const options = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
}

// Function to render assignments
function renderAssignments(assignmentsToRender) {
    const container = document.getElementById('assignments-container');
    container.innerHTML = '';

    // Check if user is authorized by looking for a token
    const isAuthorized = !!localStorage.getItem('google_calendar_token');

    // when theres no assignment to display
    if (assignmentsToRender.length === 0) {
        if (!isAuthorized) {
            container.innerHTML = `
                <div class="empty-state-unauthorized">
                    <h3>Welcome to DueBoard!</h3>
                    <p class="first-p"><strong>DueBoard</strong> is for ALU students only. Click "Authorize Access" and sign in with your <strong>@alustudent.com</strong> email address.</p>
                    <p class="first-p">Ensure your Canvas calendar is synced with your ALU Google account.</p>
                    <p class="first-p second-p"><strong>Sync Steps:</strong> In Canvas, go to <strong>Calendar</strong>, select your name and courses if they not already selected, click <strong>Calendar Feed</strong>, and copy the URL. Go to your Google Calendar, click <strong>+</strong> beside "Other Calendars," to add a new calendar, select <strong>From URL</strong>, paste the link, check the box <strong>Make publicly accessible</strong>, and click <strong>Add Calendar</strong>.
                    </p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Assignments to Display</h3>
                    <p>Adjust your filters/search or click "Refresh Assignments" to display your available canvas assignments</p>
                </div>
            `;
        }
        return;
    }

    assignmentsToRender.forEach(assignment => {
        const daysUntil = getDaysUntil(assignment.dueDate);
        const countdownClass = getCountdownClass(daysUntil);
        // const formattedDate = formatDate(assignment.dueDate);
        const isUrgent = daysUntil <= 2;

        // Calculate countdown text
        let countdownText;
        if (daysUntil > 0) {
            countdownText = `${daysUntil} day${daysUntil !== 1 ? 's' : ''} left`;
        } else if (daysUntil === 0) {
            countdownText = 'Due today';
        } else {
            countdownText = 'Already due';
        }

        const formattedDate = formatDate(assignment.dueDate);
        // Determine card class based on countdown status
        const cardClass = countdownClass === 'overdue' ? 'card-overdue' : countdownClass === 'urgent' ? 'card-urgent' : '';

        const card = document.createElement('div');
        card.className = `assignment-card ${isUrgent ? 'card-urgent' : ''}`;
        card.innerHTML = `
          <div class="assignment-header">
            <div class="title-section">
              <div class="assignment-title">${assignment.title}</div>
              <span class="assignment-course">${assignment.course}</span>
            </div>
            <div class="due-date-section">
              <span class="assignment-date">${formattedDate}</span>
              <span class="countdown ${countdownClass}">
              ${countdownText}
              </span>
            </div>
          </div>
          <div class="assignment-body">
            <div class="assignment-description" id="desc-${assignment.id}">
            <div class="desc-title">Assignment Description:</div>
              ${assignment.description}
            </div>
            <span class="toggle-description" data-id="${assignment.id}">
              <span>Show detail</span> <span>↓</span>
            </span>
          </div>
        `;
        container.appendChild(card);
    });

    document.querySelectorAll('.toggle-description').forEach(button => {
        button.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            const desc = document.getElementById(`desc-${id}`);
            desc.classList.toggle('expanded');

            const arrowSpan = this.querySelector('span:last-child');
            const textSpan = this.querySelector('span:first-child');

            if (desc.classList.contains('expanded')) {
                arrowSpan.textContent = '↑';
                textSpan.textContent = 'Hide detail';
            } else {
                arrowSpan.textContent = '↓';
                textSpan.textContent = 'Show detail';
            }
        });
    });
}

// Event listener for sorting by due date
document.getElementById('sort-due').addEventListener('click', function () {
    if (!canvasCalendarId) {
        return; // Exit if calendar isn’t found
    }

    const sorted = [...assignments].sort((a, b) => a.dueDate - b.dueDate);
    renderAssignments(sorted);
    document.getElementById('sort-due').classList.remove('btn-outlined');
    document.getElementById('sort-due').classList.add('btn-primary');
    document.getElementById('sort-title').classList.remove('btn-primary');
    document.getElementById('sort-title').classList.add('btn-outlined');
    document.getElementById('show-urgent').classList.remove('btn-primary');
    document.getElementById('show-urgent').classList.add('btn-outlined');
});

// Event listener for sorting by title
document.getElementById('sort-title').addEventListener('click', function () {
    if (!canvasCalendarId) {
        return;
    }

    const sorted = [...assignments].sort((a, b) => a.title.localeCompare(b.title));
    renderAssignments(sorted);
    document.getElementById('sort-title').classList.remove('btn-outlined');
    document.getElementById('sort-title').classList.add('btn-primary');
    document.getElementById('sort-due').classList.remove('btn-primary');
    document.getElementById('sort-due').classList.add('btn-outlined');
    document.getElementById('show-urgent').classList.remove('btn-primary');
    document.getElementById('show-urgent').classList.add('btn-outlined');
});

// Event listener for showing urgent assignments
document.getElementById('show-urgent').addEventListener('click', function () {
    if (!canvasCalendarId) {
        return;
    }

    const urgent = assignments.filter(a => getDaysUntil(a.dueDate) >= 0 && getDaysUntil(a.dueDate) <= 3);
    renderAssignments(urgent);
    document.getElementById('show-urgent').classList.remove('btn-outlined');
    document.getElementById('show-urgent').classList.add('btn-primary');
    document.getElementById('sort-due').classList.remove('btn-primary');
    document.getElementById('sort-due').classList.add('btn-outlined');
    document.getElementById('sort-title').classList.remove('btn-primary');
    document.getElementById('sort-title').classList.add('btn-outlined');
});

// Event listener for search
document.getElementById('search-input').addEventListener('input', function () {
    if (!canvasCalendarId) {
        return;
    }

    const searchTerm = this.value.toLowerCase();
    const filtered = assignments.filter(a =>
        a.title.toLowerCase().includes(searchTerm) ||
        a.course.toLowerCase().includes(searchTerm)
    );
    renderAssignments(filtered);
});

function loadGoogleApis() {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = gapiLoaded;
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = gisLoaded;
    document.body.appendChild(gisScript);
}

window.onload = () => {
    loadGoogleApis();
    document.getElementById('authorize_button').addEventListener('click', handleAuthClick);
    document.getElementById('signout_button').addEventListener('click', handleSignoutClick);
    // Render initial pre-auth state immediately
    renderAssignments(assignments);
};
