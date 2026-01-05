/**
 * C4lendar Bot - Google Apps Script Calendar API
 * Version 2.0 - Production-ready for Cloudflare Workers
 * 
 * This script handles calendar operations via HTTP API
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createResponse(400, { ok: false, message: 'No data received' });
    }
    
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    Logger.log('Received action: ' + action);
    Logger.log('Data: ' + JSON.stringify(data));
    
    switch (action) {
      case 'create':
        return createEvent(data);
      case 'update':
        return updateEvent(data);
      case 'delete':
        return deleteEvent(data);
      default:
        return createResponse(400, { 
          ok: false, 
          message: 'Invalid action. Use: create, update, or delete' 
        });
    }
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return createResponse(500, { 
      ok: false, 
      message: error.toString() 
    });
  }
}

function createEvent(data) {
  const calendar = CalendarApp.getDefaultCalendar();
  
  try {
    let event;
    
    if (data.allDay) {
      // All-day event
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      
      Logger.log('Creating all-day event: ' + data.title);
      Logger.log('Start: ' + startDate.toISOString());
      Logger.log('End: ' + endDate.toISOString());
      
      event = calendar.createAllDayEvent(
        data.title,
        startDate,
        endDate,
        {
          location: data.location || '',
          description: data.notes || ''
        }
      );
    } else {
      // Timed event
      const startTime = new Date(data.start);
      const endTime = new Date(data.end);
      
      Logger.log('Creating timed event: ' + data.title);
      Logger.log('Start: ' + startTime.toISOString());
      Logger.log('End: ' + endTime.toISOString());
      
      event = calendar.createEvent(
        data.title,
        startTime,
        endTime,
        {
          location: data.location || '',
          description: data.notes || ''
        }
      );
    }
    
    const eventId = event.getId();
    Logger.log('Event created with ID: ' + eventId);
    
    return createResponse(200, {
      ok: true,
      eventId: eventId,
      title: data.title,
      start: data.allDay ? data.startDate : data.start,
      end: data.allDay ? data.endDate : data.end,
      message: 'Event created successfully'
    });
  } catch (error) {
    Logger.log('Create error: ' + error.toString());
    return createResponse(500, {
      ok: false,
      message: 'Failed to create event: ' + error.toString()
    });
  }
}

function updateEvent(data) {
  try {
    const event = CalendarApp.getEventById(data.eventId);
    
    if (!event) {
      Logger.log('Event not found: ' + data.eventId);
      return createResponse(404, { 
        ok: false, 
        message: 'Event not found' 
      });
    }
    
    Logger.log('Updating event: ' + data.eventId);
    
    // Update title
    event.setTitle(data.title);
    
    // Update time/date
    if (data.allDay) {
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      event.setAllDayDates(startDate, endDate);
      Logger.log('Updated to all-day: ' + startDate.toISOString() + ' to ' + endDate.toISOString());
    } else {
      const startTime = new Date(data.start);
      const endTime = new Date(data.end);
      event.setTime(startTime, endTime);
      Logger.log('Updated time: ' + startTime.toISOString() + ' to ' + endTime.toISOString());
    }
    
    // Update location if provided
    if (data.location !== undefined) {
      event.setLocation(data.location);
    }
    
    // Update notes if provided
    if (data.notes !== undefined) {
      event.setDescription(data.notes);
    }
    
    return createResponse(200, {
      ok: true,
      eventId: event.getId(),
      title: data.title,
      message: 'Event updated successfully'
    });
  } catch (error) {
    Logger.log('Update error: ' + error.toString());
    return createResponse(500, {
      ok: false,
      message: 'Failed to update event: ' + error.toString()
    });
  }
}

function deleteEvent(data) {
  try {
    const event = CalendarApp.getEventById(data.eventId);
    
    if (!event) {
      Logger.log('Event not found: ' + data.eventId);
      return createResponse(404, { 
        ok: false, 
        message: 'Event not found' 
      });
    }
    
    Logger.log('Deleting event: ' + data.eventId);
    event.deleteEvent();
    
    return createResponse(200, {
      ok: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    Logger.log('Delete error: ' + error.toString());
    return createResponse(500, {
      ok: false,
      message: 'Failed to delete event: ' + error.toString()
    });
  }
}

function createResponse(status, data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Health check endpoint
function doGet(e) {
  return createResponse(200, {
    status: 'C4lendar Bot GAS API v2.0',
    timestamp: new Date().toISOString(),
    actions: ['create', 'update', 'delete']
  });
}

// Test function for debugging in Apps Script editor
function testCreateEvent() {
  const testData = {
    action: 'create',
    title: 'Test Event from Apps Script',
    allDay: false,
    start: '2026-01-15T14:00:00+08:00',
    end: '2026-01-15T15:00:00+08:00',
    location: 'Test Location',
    notes: 'Created via Apps Script test'
  };
  
  const result = createEvent(testData);
  Logger.log(result.getContent());
}
