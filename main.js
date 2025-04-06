import { CONFIG } from './config.js';

const API_KEY = CONFIG.api_key;
const CLIENT_ID = CONFIG.client_Id;

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let assignments = []; // hold assignments from canvas calendar


// Error handling: func to set error messages
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
                console.error('Error parsing stored token:', error);
                localStorage.removeItem('google_calendar_token');
                setErrorMessage('Session expired. Please authorize again.');
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
    setErrorMessage(); // Clear errors on retry for a fresh attempt
    const currentToken = gapi.client.getToken();

    // Callback for token request
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            console.error('Authorization error:', resp);
            setErrorMessage("Unable to authorize access. Permission denied to access calendars, please authorize again!");
            return;
        }
        localStorage.setItem('google_calendar_token', JSON.stringify(gapi.client.getToken()));
        document.getElementById('signout_button').style.visibility = 'visible';
        document.getElementById('authorize_button').innerText = 'Refresh Assignments';
        setErrorMessage(); // Clear any previous error
        await listUpcomingEvents();
    };

    if (currentToken === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        try {
            await listUpcomingEvents();
        } catch (err) {
            if (err.result?.error?.code === 401 || err.result?.error?.code === 403) {
                tokenClient.requestAccessToken({ prompt: '' }); // Silent refresh
            } else {
                console.error('Error fetching events with existing token:', err);
                setErrorMessage('Unable to refresh Assignments. Please check your internet connection and try again!');
            }
        }
    }
}

/**
 * User signOut: revokes the OAuth token and clear local storage.
 * Updates the UI to reflect the logged-out state.
 */
function handleSignoutClick() {
    setErrorMessage(); // Clear errors on signout for a fresh state
    const token = gapi.client.getToken();
    if (token !== null) {
        try {
            google.accounts.oauth2.revoke(token.access_token);
        } catch (error) {
            console.error('Error revoking token:', error);
        }
        gapi.client.setToken('');
        localStorage.removeItem('google_calendar_token');
        document.getElementById('authorize_button').innerText = 'Authorize Access';
        document.getElementById('signout_button').style.visibility = 'hidden';
        assignments = []; // Clear assignments
        canvasCalendarId = null; // Reset calendar ID
        renderAssignments(assignments); // Update UI with pre-auth state
    }
}

let canvasCalendarId = null;

// Find and store Canvas calendar ID
async function getCanvasCalendar() {
    setErrorMessage(); // Clear errors before retrying to fetch calendar
    try {
        const response = await gapi.client.calendar.calendarList.list();
        const calendar_list = response.result;
        const canvasCalendar = calendar_list.items.find(cal =>
            cal.summary.toLowerCase().includes("canvas")
        );

        if (!canvasCalendar) {
            setErrorMessage('No Canvas calendar found. Follow the "Sync steps" above to link your Canvas calendar, then sign out and re-authorize access.');
            return null;
        }

        canvasCalendarId = canvasCalendar.id;
        return canvasCalendarId;
    } catch (err) {
        console.log(err) // i use thi to check whats in the error obj
        if (err.result.error.code === 401 && err.result.error.errors[0].message === "Invalid Credentials") {
            setErrorMessage("Sorry, your session has expired, please sign out and re-athourise access")
        }
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
    setErrorMessage(); // Clear errors on retry for a fresh fetch attempt
    if (!canvasCalendarId) {
        await getCanvasCalendar();
    }
    if (!canvasCalendarId) return;

    try {
        const request = {
            'calendarId': canvasCalendarId,
            'timeMin': oneMonthAgo.toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 20,
            'orderBy': 'startTime',
        };
        const response = await gapi.client.calendar.events.list(request);
        const events = response.result.items || [];
        if (events.length === 0) {
            setErrorMessage('No upcoming Canvas events found.');
            assignments = [];
            renderAssignments(assignments);
            return;
        }

        assignments = events.map((event, index) => {
            const courseMatch = event.summary?.match(/\[(.*?)\]/) || [];
            const courseName = courseMatch[1] || 'Canvas';
            const rawTitle = event.summary || 'Untitled Event';
            const cleanTitle = rawTitle.replace(/\s*\[.*?\]\s*/g, '').trim();

            const hasQuizInTitle = cleanTitle.toLowerCase().includes('quiz');
            const description = hasQuizInTitle && (!event.description || !event.description.trim())
                ? `This is a quiz for ${courseName}`
                : event.description || 'No Description';

            let dueDate;
            if (event.end?.date && !event.end?.dateTime) {
                const [year, month, day] = event.end.date.split('-');
                dueDate = new Date(year, month - 1, day);
                if (isNaN(dueDate.getTime())) {
                    console.error('Invalid end.date for event:', event);
                    dueDate = new Date();
                }
                dueDate.setMinutes(dueDate.getMinutes() - 1);
            } else if (event.end?.dateTime) {
                dueDate = new Date(event.end.dateTime);
                if (isNaN(dueDate.getTime())) {
                    console.error('Invalid end.dateTime for event:', event);
                    dueDate = new Date();
                }
            } else {
                console.error('Event missing end date:', event);
                dueDate = new Date();
            }

            return {
                id: index,
                title: cleanTitle,
                dueDate: dueDate,
                description: description,
                course: courseName
            };
        });
        renderAssignments(assignments);
    } catch (err) {
        console.error('Event fetch error:', err);
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
            setErrorMessage('Network error: Please check your internet connection.');
        } else if (err.result?.error?.code === 404) {
            setErrorMessage('Canvas calendar not found. Please ensure it’s synced correctly.');
        } else if (err.result?.error?.code === 403) {
            setErrorMessage('Permission denied. Please authorize again.');
        } else {
            setErrorMessage('Unable to fetch events. Please try again later.');
        }
        throw err;
    }
}

// Function to calculate days until due date
function getDaysUntil(dueDate) {
    const now = new Date();
    const diffTime = dueDate - now;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

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
    const isAuthorized = !!localStorage.getItem('google_calendar_token');

    if (assignmentsToRender.length === 0) {
        if (!isAuthorized) {
            container.innerHTML = `
                <div class="empty-state-unauthorized">
                    <h3>Welcome to DueBoard!</h3>
                    <p class="first-p"><span class="dueboard-org"><strong>DueBoard</strong> is for ALU students only or can only be used within its organisation, <strong>alueducation</strong>!</span></p>
                    <p class="first-p">Ensure your Canvas calendar is synced to your Google calendar, <strong>syn steps</strong> below. Then authorize access with your <strong>@alustudent.com</strong> email.</p>
                    <p class="first-p second-p"><strong>Sync Steps:</strong> In Canvas, go to <strong>Calendar</strong>, select your name and courses if they not already selected, click <strong>Calendar Feed</strong>, and copy the URL. Go to your Google Calendar, click <strong>+</strong> beside "Other Calendars," to add a new calendar, select <strong>From URL</strong>, paste the link, check the box <strong>Make publicly accessible</strong>, and click <strong>Add Calendar</strong>.</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Assignments to Display</h3>
                     <p>Please check for any issues below, adjust your filters/search, or click "Refresh Assignments" to update your list.</p>
                </div>
            `;
        }
        return;
    }

    assignmentsToRender.forEach(assignment => {
        const daysUntil = getDaysUntil(assignment.dueDate);
        const countdownClass = getCountdownClass(daysUntil);
        const isUrgent = daysUntil <= 2;

        let countdownText;
        if (daysUntil > 0) {
            countdownText = `${daysUntil} day${daysUntil !== 1 ? 's' : ''} left`;
        } else if (daysUntil === 0) {
            countdownText = 'Due today';
        } else {
            countdownText = 'Already due';
        }

        const formattedDate = formatDate(assignment.dueDate);
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
              <span class="countdown ${countdownClass}">${countdownText}</span>
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
    if (!canvasCalendarId) return; // Exit if calendar isn’t found

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
    if (!canvasCalendarId) return;

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
    if (!canvasCalendarId) return;

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
    if (!canvasCalendarId) return;

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
    gapiScript.onerror = () => setErrorMessage('Failed to load the required Google resources. Please check your internet connection.');
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = gisLoaded;
    gisScript.onerror = () => setErrorMessage('Failed to load the required Google resources. Please check your internet connection.');
    document.body.appendChild(gisScript);
}

window.onload = () => {
    loadGoogleApis();
    document.getElementById('authorize_button').addEventListener('click', handleAuthClick);
    document.getElementById('signout_button').addEventListener('click', handleSignoutClick);
    renderAssignments(assignments); // Render initial pre-auth state immediately
};
