var spreadsheetId = "1ugAk-o3ATqDBqQtoYVAKK4ACD6NSqPdzT6NW73GnfaE";

function getSpreadsheet() {
  return SpreadsheetApp.openById(spreadsheetId);
}

function getQuestionsSheet() {
  var spreadsheet = getSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Questions");

  if (!sheet) {
    sheet = spreadsheet.insertSheet("Questions");
    sheet.appendRow(["ID", "Thème", "Question", "Réponse 1", "Réponse 2", "Réponse 3", "Réponse 4", "Bonne réponse"]);
  }

  return sheet;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function readQuestions() {
  var sheet = getQuestionsSheet();
  var rows = sheet.getDataRange().getValues();

  return rows.slice(1).filter(function(row) {
    return row[0] && row[2];
  }).map(function(row) {
    return {
      id: String(row[0]),
      themeId: String(row[1]),
      q: String(row[2]),
      r: [String(row[3]), String(row[4]), String(row[5]), String(row[6])],
      correct: Number(row[7])
    };
  });
}

function findQuestionRow(sheet, id) {
  var values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();

  for (var index = 0; index < values.length; index++) {
    if (String(values[index][0]) === String(id)) return index + 2;
  }

  return -1;
}

function writeQuestion(sheet, row, question) {
  sheet.getRange(row, 1, 1, 8).setValues([[
    String(question.id),
    String(question.themeId),
    String(question.q),
    String(question.r[0]),
    String(question.r[1]),
    String(question.r[2]),
    String(question.r[3]),
    Number(question.correct)
  ]]);
}

function cleanupDuplicateQuestions() {
  var sheet = getQuestionsSheet();
  var rows = sheet.getDataRange().getValues();
  var seen = {};
  var rowsToDelete = [];

  rows.slice(1).forEach(function(row, index) {
    var key = String(row[2]).trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) return;

    if (Object.prototype.hasOwnProperty.call(seen, key)) {
      rowsToDelete.push(index + 2);
    } else {
      seen[key] = true;
    }
  });

  rowsToDelete.reverse().forEach(function(row) {
    sheet.deleteRow(row);
  });

  return rowsToDelete.length;
}

function handleQuestionRequest(data) {
  var sheet = getQuestionsSheet();

  if (data.action === "cleanup") {
    var removed = cleanupDuplicateQuestions();
    return jsonResponse({ removed: removed, questions: readQuestions() });
  }

  if (data.action === "seed") {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty("questionsSeeded") === "true" && !data.force) {
      return jsonResponse({ questions: readQuestions() });
    }

    var existingIds = {};
    readQuestions().forEach(function(question) {
      existingIds[question.id] = true;
    });

    (data.questions || []).forEach(function(question) {
      if (existingIds[question.id]) return;
      var seededQuestion = Object.assign({}, question, { id: question.id || Utilities.getUuid() });
      writeQuestion(sheet, sheet.getLastRow() + 1, seededQuestion);
    });

    properties.setProperty("questionsSeeded", "true");
    return jsonResponse({ questions: readQuestions() });
  }

  if (data.action === "create") {
    var createdQuestion = Object.assign({}, data.question, { id: data.question.id || Utilities.getUuid() });
    writeQuestion(sheet, sheet.getLastRow() + 1, createdQuestion);
    return jsonResponse({ question: createdQuestion });
  }

  var row = findQuestionRow(sheet, data.id);
  if (row === -1) return jsonResponse({ error: "Question introuvable" });

  if (data.action === "update") {
    var updatedQuestion = Object.assign({}, data.question, { id: data.id });
    writeQuestion(sheet, row, updatedQuestion);
    return jsonResponse({ question: updatedQuestion });
  }

  if (data.action === "delete") {
    sheet.deleteRow(row);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "Action question inconnue" });
}

function doGet(event) {
  if (event.parameter.type === "questions") {
    return jsonResponse({ questions: readQuestions() });
  }

  return jsonResponse({ success: true });
}

function doPost(event) {
  var data = JSON.parse(event.postData.contents || "{}");
  if (data.type === "questions") return handleQuestionRequest(data);

  var sheet = getSpreadsheet().getSheets()[0];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Date", "Nom du candidat", "Mail", "Spécialité"]);
  }

  sheet.appendRow([
    new Date(),
    String(data.name || ""),
    String(data.email || ""),
    String(data.specialty || "")
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
