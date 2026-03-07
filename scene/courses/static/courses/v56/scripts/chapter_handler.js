const{basicSetup, EditorView}=window.cm_codemirror;
const{EditorState, Compartment}=window.cm_state;
const{highlightActiveLine, keymap}=window.cm_view;
const{indentUnit, StreamLanguage}=window.cm_language;
const{autocompletion, closeBrackets, closeBracketsKeymap}=window.cm_autocomplete;
const{indentWithTab}=window.cm_commands;
const{python}=window.cm_lang_python;
const{rust}=window.cm_lang_rust;
const{cpp}=window.cm_lang_cpp;
const{go}=window.cm_legacy_mode_lang_go;
const{shell}=window.cm_legacy_mode_lang_shell;
const{haskell}=window.cm_legacy_mode_lang_haskell;
const{oneDark}=window.cm_theme_one_dark;

const is_authorized = document.getElementById("login-register") == null;

const btn_run_prefix = 'btn-run-';

let tabSize = new Compartment;
let readOnly = new Compartment;
let editable = new Compartment;
let editorTheme = new Compartment();

SENJUN_URL = window.location.origin;

CODE_EDITORS = new Map();
CODE_EXAMPLES = new Map();
DEFAULT_SOLUTIONS = new Map();
SOLUTION_STATUSES = new Map();

var ansi_up = new AnsiUp;

const modal_overlay_id = "modal_overlay";

const ok_symbol = '<i class="fa fa-solid fa-star green"></i> ';
const err_symbol = '<i class="fa fa-solid fa-bug highlight"></i> ';
const out_symbol = '<i class="fa fa-solid fa-file light-blue"></i> ';

const solution_ok_text = ok_symbol + '<b class="green">Решение прошло все тесты!</b><br/><br/>';
const solution_test_err_text = err_symbol + '<b class="highlight">Решение запустилось, но не прошло тесты</b><br/><br/>';
const solution_run_err_text = err_symbol + '<b class="highlight">Не удалось запустить решение</b><br/><br/>';
const server_err_text = err_symbol + '<b class="highlight">При обработке решения что-то пошло не так</b><br/><br/>';
const network_err_text = err_symbol + '<b class="highlight">Не удалось отправить решение на сервер</b><br/><br/>';

const console_output_text = out_symbol + '<b class="light-blue">Консольный вывод:</b><br/><br/>';

const answer_ok_text = ok_symbol + '<b class="green">Правильно!</b><br/><br/>';
const answer_err_text = err_symbol + '<b class="highlight">Ответ неправильный</b><br/><br/>';

const bugreport_text = '<p class="indent-small">Вы можете сообщить об этой ошибке в нашей <a href="https://t.me/senjun_feedback" target="_blank" rel="noopener noreferrer">телеграм-группе.</a></p>';

const req_timeout_ms = 60 * 1000;

const csrftoken_cookie = 'csrftoken';

const sidebarWidth = window.innerWidth > 1920 ? "500px" : "350px";

const svgPlayground = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M346.3 271.8l-60.1-21.9L214 448H32c-17.7 0-32 14.3-32 32s14.3 32 32 32H544c17.7 0 32-14.3 32-32s-14.3-32-32-32H282.1l64.1-176.2zm121.1-.2l-3.3 9.1 67.7 24.6c18.1 6.6 38-4.2 39.6-23.4c6.5-78.5-23.9-155.5-80.8-208.5c2 8 3.2 16.3 3.4 24.8l.2 6c1.8 57-7.3 113.8-26.8 167.4zM462 99.1c-1.1-34.4-22.5-64.8-54.4-77.4c-.9-.4-1.9-.7-2.8-1.1c-33-11.7-69.8-2.4-93.1 23.8l-4 4.5C272.4 88.3 245 134.2 226.8 184l-3.3 9.1L434 269.7l3.3-9.1c18.1-49.8 26.6-102.5 24.9-155.5l-.2-6zM107.2 112.9c-11.1 15.7-2.8 36.8 15.3 43.4l71 25.8 3.3-9.1c19.5-53.6 49.1-103 87.1-145.5l4-4.5c6.2-6.9 13.1-13 20.5-18.2c-79.6 2.5-154.7 42.2-201.2 108z"/></svg>';

// If user scrolled to the bottom of the page and correctly solved all tasks in chapter (if any)
// we can mark this chapter as completed
var scrolled_to_bottom = false;
var marked_chapter_as_completed = false;

var tasks_count = 0;

var playgroundTab = null;

var unfinished_projects = [];

var changed_task_id = null; // string if filled
// task id to text
var changed_task_texts = new Map();

function solved_all_tasks() {
  var solved = true;

  SOLUTION_STATUSES.forEach((value, key) => {
    if (value !== "TaskCompleted") {
      solved = false;
    }
  });

  return solved;
}

function closeContents() {
  document.getElementById("chapter_sidebar").style.width = "0";
  document.getElementById("main").style.marginLeft= "0";
}

function toggleContents() {
  const width = sidebarWidth;

  var sidebar = document.getElementById("chapter_sidebar");
  if (sidebar.style.width !== width) {
    sidebar.style.width = width;
    document.getElementById("main").style.marginLeft = width;
  }   else {
    closeContents();
  }
}

function handle_mark_chapter_as_completed(response) {
  if (response.hasOwnProperty('error_code')) {
    if (response.error_code !== 3) {
      marked_chapter_as_completed = false;
      return;
    }
  }

  var btn_finish = document.getElementById("btn_finish_course");

  if(btn_finish) {
    btn_finish.disabled = false;
    btn_finish.title = "Завершить курс";
  }
}

function get_chapter_id() {
  return document.getElementById("markdown-content").getAttribute("chapter_id");
}

function mark_chapter_as_completed() {
  const token = getCookie(csrftoken_cookie);

  if (token === null) {
    window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
    return;
  }

  const solved_all = solved_all_tasks();
  const need_to_mark = !marked_chapter_as_completed && scrolled_to_bottom && solved_all;

  if (!need_to_mark) {
    return;
  }

  marked_chapter_as_completed = true;
  const cur_chapter_id = get_chapter_id();

  fetch(SENJUN_URL+"/finish_chapter/", {
      method: 'POST',
      signal: AbortSignal.timeout(req_timeout_ms),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-CSRFToken': token
      },
      body: JSON.stringify({
        "chapter_id": cur_chapter_id
      }),
  }).then(response => response.json())
  .then(response => handle_mark_chapter_as_completed(response))  
  .catch((error) => {
    const err = '<p>Не удалось отправить запрос на сервер для завершения главы. Пожалуйста, повторите попытку позже.</p>' + bugreport_text;
    showModal("Ошибка", err);
  });
}

function getCookie(name) {
  var cookieValue = null;
  if (document.cookie && document.cookie != '') {
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
          var cookie = cookies[i].trim();
          // Does this cookie string begin with the name we want?
          if (cookie.substring(0, name.length + 1) == (name + '=')) {
              cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
              break;
          }
      }
  }
  return cookieValue;
}

function b64EncodeUnicode(str) {
  // first we use encodeURIComponent to get percent-encoded UTF-8,
  // then we convert the percent encodings into raw bytes which
  // can be fed into btoa.
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
          return String.fromCharCode('0x' + p1);
  }));
}

function b64DecodeUnicode(str) {
  // Going backwards: from bytestream, to percent-encoding, to original string.
  return decodeURIComponent(atob(str).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
}

function showSolutionDiv(task_id, div_content) {
  const div_id = getOutputIdForSolution(task_id);
  var parent_elem = document.getElementById(task_id);

  var solutionDiv = document.getElementById(div_id);

  if (!solutionDiv) {
    pre = document.createElement('pre');
    solutionDiv = document.createElement('div');
    solutionDiv.classList.add('user_code_output');
    solutionDiv.classList.add('indent-small');
    solutionDiv.setAttribute('id', div_id);
    pre.appendChild(solutionDiv);

    parent_elem.parentNode.appendChild(pre);
  }

  solutionDiv.innerHTML = div_content;
}

function getOutputIdForSolution(task_id) {
  return task_id + "_output";
}

function getStatusClass(response) {
  if (response.status_code == 0) {
    return "TaskCompleted";
  }

  return "TaskInProgress";
}


function getConsoleOutputQuestion(response) {

  switch(response.status_code) {
    case 0:
      return answer_ok_text;
  
    case 1: // Error while running user code
      return answer_err_text;
  
    case 2: // Didn't pass tests
    {
      let output_text = "";
      if (response.hasOwnProperty('tests_output') && response.tests_output.length > 0) {
        output_text = ansi_up.ansi_to_html(response.tests_output) + '<br/>';
      }

      return answer_err_text + output_text;
    }

    default: // Unexpected error
      return server_err_text;
  }
}


function getConsoleOutputCode(response) {
  var output_text = "";
  switch(response.status_code) {
    case 0:
      output_text += solution_ok_text;
      break;
  
    case 1: // Error while running user code
      output_text += solution_run_err_text;
      break;
  
    case 2: // Didn't pass tests
      output_text += solution_test_err_text;
      break;

    default: // Unexpected error
      output_text += server_err_text;
  }

  if (response.hasOwnProperty('tests_output') && response.tests_output.length > 0) {
    output_text += ansi_up.ansi_to_html(response.tests_output) + '<br/>';
  }

  if (response.hasOwnProperty('user_code_output') &&  response.user_code_output.length > 0) {
    output_text += console_output_text;
    output_text += ansi_up.ansi_to_html(response.user_code_output);
  }

  return output_text;
}

function showRunTaskResult(task_id, task_type, response) {
  document.getElementById(btn_run_prefix+task_id).disabled = false;
  const status_class = getStatusClass(response);

  const output_text = task_type === "code" ? getConsoleOutputCode(response) : getConsoleOutputQuestion(response);

  showSolutionDiv(task_id, output_text);
  highlightTask(task_id, status_class);
  SOLUTION_STATUSES.set(task_id, status_class);

  marked_chapter_as_completed = false;
  
  mark_chapter_as_completed();
  update_tasks_progress_bar();
}

function showModal(title, msgHtml) {
  var modalMsg = document.getElementById(modal_overlay_id);

  modalMsg.innerHTML = '<div class="modal-content"><span class="close" onclick="closeModal()">&times;</span><div class="padding-top-small"><h3 class="title-modal">' + title +'</h3>' + msgHtml + '</div></div>';
  modalMsg.style.display = "block";
}

function showModalIde(title, code, lang) {
  var modalMsg = document.getElementById(modal_overlay_id);
  var textArea = document.createElement('textarea');
  textArea.innerHTML = code;

  modalMsg.innerHTML = '<div class="modal-content"><span class="close" onclick="closeModal()">&times;</span><div class="padding-top-small"><h3 class="title-modal">' + title +'</h3><div id="answer_container"></div></div></div>';
  
  var container = document.getElementById("answer_container");
  container.appendChild(textArea);
  replaceTextAreaWithIde(textArea, lang, true);
  modalMsg.style.display = "block";
}

function openPlayground(task_id, lang, is_code_example) {
  if (!is_authorized) {
    window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
    return;
  }

  const token = getCookie(csrftoken_cookie);

  if (token === null) {
    window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
    return;
  }

  playgroundTab = window.open('', '_blank');

  let source_code = "";
  let cur_id = "";
  let example_id  = "";
  if (is_code_example) {
    source_code = CODE_EXAMPLES.get(task_id).state.doc.toString();
    cur_id = get_chapter_id() + "_task_0000";
    if (task_id.startsWith("example_for_playground_")) {
      example_id = task_id;
    }
  } else {
    source_code = CODE_EDITORS.get(task_id).state.doc.toString();
    cur_id = task_id;
  }
  
  source_code_base64 = b64EncodeUnicode(source_code);

  fetch(SENJUN_URL+"/create_playground/", {
    method: 'POST',
    signal: AbortSignal.timeout(req_timeout_ms),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-CSRFToken': token
    },
    body: JSON.stringify({
      "lang_id": lang,
      "task_id": cur_id,
      "user_code":  source_code_base64,
      "example_id": example_id,
    }),
}).then(response => response.json())
.then(response => openPlaygroundResult(response))
.catch((error) => {
  console.error(error);
  if (playgroundTab) {
    playgroundTab.close();
  }
});
}

function openPlaygroundResult(response) {
  if (response.status_code == 0) {
    playgroundTab.location.href = SENJUN_URL  + response.url;
   // window.open(SENJUN_URL  + response.url, "_blank");
    return;
  }

  const err = '<p>Не удалось открыть песочницу с этим кодом. Пожалуйста, повторите попытку позже.</p>' + bugreport_text;
  showModal("Ошибка", err);
  if (playgroundTab) {
    playgroundTab.close();
  }
}

function runTask(task_id, task_type, needs_type_checking) {
  document.getElementById(btn_run_prefix+task_id).disabled = true;
  user_code = CODE_EDITORS.get(task_id).state.doc.toString();
  user_code_base64 = b64EncodeUnicode(user_code);

  const token = getCookie(csrftoken_cookie);

  if (!is_authorized || token === null) {
    try {
      localStorage.setItem("task_id", task_id);
      localStorage.setItem("task_type", task_type);
      localStorage.setItem("task_needs_type_checking", needs_type_checking);
      localStorage.setItem("task_solution", user_code_base64);
    } catch (error) {
      console.error(error);
    }

    window.location.href = SENJUN_URL  + "/login/?action=run_task&next=" + window.location.href;
    return;
  }
  
  showSolutionDiv(task_id, '<div class="loader"></div><div class="text-loader">Запуск...</div>');

  fetch(SENJUN_URL+"/run_task/", {
      method: 'POST',
      signal: AbortSignal.timeout(req_timeout_ms),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-CSRFToken': token
      },
      body: JSON.stringify({
        "task_id": task_id,
        "task_type": task_type,
        "solution_text":  user_code_base64,
        "color_output": true,
        "run_static_type_checker": needs_type_checking
      }),
  }).then(response => response.json())
  .then(response => showRunTaskResult(task_id, task_type, response))
  .catch((error) => {
    console.error(error);
    document.getElementById(btn_run_prefix+task_id).disabled = false;
    showSolutionDiv(task_id, network_err_text);
  });
}

function saveTask(task_id) {
  user_code = CODE_EDITORS.get(task_id).state.doc.toString();
  user_code_base64 = b64EncodeUnicode(user_code);

  const token = getCookie(csrftoken_cookie);

  if (!is_authorized || token === null) {
    // TODO: something better?
    return;
  }
  
  fetch(SENJUN_URL+"/save_task/", {
      method: 'POST',
      signal: AbortSignal.timeout(req_timeout_ms),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-CSRFToken': token
      },
      body: JSON.stringify({
        "task_id": task_id,
        "solution_text":  user_code_base64,
      }),
  }).then(response => response.json())
  .then(response => handleSaveTaskResult(task_id, response))
  .catch((error) => {
    console.error("Error while saving task in background", task_id, error);
  });
}

function handleSaveTaskResult(task_id, response) {
  if (response.hasOwnProperty("status_code") && response.status_code == 0) {
    // console.log("Successfully saved task in background", task_id);
  } else {
    console.error("Couldn't save task in background", task_id, response);
  }
}


function getHint(task_id) {
  const hidden_hint = document.getElementById(task_id).parentElement.getElementsByClassName("task_hint")[0];

  if (hidden_hint) {
    return hidden_hint.outerHTML;
  }

  return "Подсказка для этой задачи не готова. Пожалуйста, сообщите нам об этом в форме фидбэка под главой. Это поможет нам оперативно добавить подсказку!";
}

function getFullAnswer(task_id) {
  const answer = document.getElementById(task_id).parentElement.getElementsByClassName("task_answer")[0];

  if (answer) {
    const lang = getLang(answer);
    return [answer.innerHTML, lang];
  }

  return ["Решение для этой задачи не готово. Пожалуйста, сообщите нам об этом в форме фидбэка под главой. Это поможет нам оперативно добавить решение!", null];
}

function showFullAnswer(e) {
  const elem_id = e.getAttribute("data");
  const [full_solution_text, lang] = getFullAnswer(elem_id);
  showModalIde("Полное решение", full_solution_text, lang);
}

function showHint(elem_id) {
  var hint_text = getHint(elem_id);
  hint_text += '<br/><button class="btn-white" onclick="showFullAnswer(this)" data=' + elem_id + '>Полное решение</button>';
  showModal("Подсказка", hint_text);
}

function reset(code_id) {
  CODE_EDITORS.get(code_id).dispatch({
  changes: {from: 0, to: CODE_EDITORS.get(code_id).state.doc.length, insert: DEFAULT_SOLUTIONS.get(code_id)}
})
}


function styleTaskStatusLabel(taskStatus, taskStatusLabel) {
  if (taskStatus === "TaskCompleted") {
    taskStatusLabel.classList.add("TaskStatusLabelOk");
    taskStatusLabel.innerHTML = '<i class="fa fa-solid fa-check"></i>';
  } else {
    taskStatusLabel.classList.add("TaskStatusLabelErr");
    taskStatusLabel.innerHTML = '<i class="fa fa-solid fa-bug"></i>';
  }
}

function styleTaskName(taskStatus, taskName) {
  if (taskStatus === "TaskNotStarted") {
    taskName.classList.add("TaskStatusLabelNotStarted");
  } else
  if (taskStatus === "TaskCompleted") {
    taskName.classList.add("TaskStatusLabelOk");
  } else {
    taskName.classList.add("TaskStatusLabelErr");
  }
}

function addTaskText(codeElem, divTask) {
  var textElems = [];

  var taskText = codeElem.parentElement.previousSibling.previousSibling;
  textElems.push(taskText);

  var cur = taskText;

  while (cur.previousSibling !== undefined && 
    cur.previousSibling.previousSibling.classList !== undefined && 
    cur.previousSibling.previousSibling.classList.contains("task_text")) {
    textElems.push(cur.previousSibling);
    textElems.push(cur.previousSibling.previousSibling);
    cur = cur.previousSibling.previousSibling;
  }

  for(let i = textElems.length - 1; i >= 0; i--) {
    divTask.appendChild(textElems[i]);
  }
}

function getLang(elem) {
  const prefix = 'language-';
  for (var i = 0; i < elem.classList.length; i++) {
    if (elem.classList[i].startsWith(prefix)) {
      return elem.classList[i].substring(prefix.length);
    }
  }

  return "";
}

function needs_static_type_checking(elem) {
  const name = 'run_static_type_checker';
  for (var i = 0; i < elem.classList.length; i++) {
    if (elem.classList[i] === name) {
      return true;
    }
  }

  return false;
}

function getTaskNumber() {
    tasks_count += 1;
    return 'Задача # ' + tasks_count.toString();
}

// Transforms element to code block
function addCodeBlock(elem_id, is_read_only, text = "", taskStatus = "") {
    let code = document.getElementById(elem_id);
    const lang = getLang(code);
    const task_type = lang === "consoleoutput" ? "plain_text" : "code";
    const needs_type_checking = needs_static_type_checking(code);

    let textArea = document.createElement('textarea');
    textArea.innerHTML = text.length == 0 ? code.innerHTML : text;
    textArea.setAttribute('id', elem_id);
    
    if (is_read_only) {

    if (code.classList.contains("example_for_playground")) {
        let divExample = document.createElement('div');
        divExample.classList.add("ExampleBlock");
        code.parentNode.appendChild(divExample);
        divExample.appendChild(textArea);
        code.parentNode.removeChild(code);

        let btnPlayground = document.createElement('button');
        btnPlayground.innerHTML = svgPlayground;
        btnPlayground.title = "Открыть в песочнице";
        btnPlayground.classList.add('btn-white');
        btnPlayground.classList.add('square');
        btnPlayground.classList.add('btn_example_for_playground');
        btnPlayground.onclick = function(){
          openPlayground(elem_id, lang, true);
        }

        textArea.parentNode.appendChild(btnPlayground);
      } else {
        code.parentNode.appendChild(textArea);
        code.parentNode.removeChild(code);
      }
    } else {
        let task_hint = code.parentElement.nextSibling.nextSibling;
        let task_answer = task_hint.nextSibling.nextSibling.firstChild;
        let divTask = document.createElement('div');
        divTask.classList.add("TaskBlock");
        divTask.classList.add(taskStatus);

        code.parentNode.appendChild(divTask);
        addTaskText(code, divTask);

        divTask.appendChild(textArea);
        divTask.appendChild(task_hint);
        divTask.appendChild(task_answer);
        
        let taskName = document.createElement('div');
        
        taskName.innerHTML = getTaskNumber();
        taskName.classList.add("TaskName");
        if (taskStatus.length > 0) {
          styleTaskName(taskStatus, taskName);
        }
        divTask.appendChild(taskName);

        if (taskStatus.length > 0) {
          if (taskStatus !== "TaskNotStarted") {
            let taskStatusLabel = document.createElement('div');
            taskStatusLabel.classList.add("TaskStatusLabel");

            styleTaskStatusLabel(taskStatus, taskStatusLabel);
            divTask.appendChild(taskStatusLabel);
          }
          SOLUTION_STATUSES.set(elem_id, taskStatus);
        }
        
        code.parentNode.removeChild(code);
        divTask.parentElement.replaceWith(...divTask.parentElement.childNodes);

        let btnRun = document.createElement('button');
        btnRun.title = "F9";

        if (lang === "consoleoutput") {
          btnRun.innerHTML = '<i class="fa fa-solid fa-rocket"></i> Проверить';
        } else {
          btnRun.innerHTML = '<i class="fa fa-solid fa-rocket"></i> Запустить';
        }

        btnRun.classList.add('btn-white');
        btnRun.setAttribute('id', btn_run_prefix+elem_id);
        btnRun.onclick = function(){
          runTask(elem_id, task_type, needs_type_checking);
        }

        let btnHint = document.createElement('button');
        btnHint.innerHTML = '<i class="fa fa-solid fa-question"></i>';
        btnHint.title = "Посмотреть подсказку";
        btnHint.classList.add('btn-gray');
        btnHint.classList.add('square');
        btnHint.classList.add('indent-left');
        btnHint.onclick = function(){
          showHint(elem_id);
        }

        let btnReset = document.createElement('button');
        btnReset.innerHTML = '<i class="fa fa-solid fa-rotate-right"></i>';
        btnReset.title = "Сбросить решение";
        btnReset.classList.add('btn-gray');
        btnReset.classList.add('square');
        btnReset.classList.add('indent-left');
        btnReset.onclick = function(){
          reset(elem_id);
        }

        textArea.parentNode.appendChild(btnRun);
        textArea.parentNode.appendChild(btnHint);
        textArea.parentNode.appendChild(btnReset);
        if (lang !== "consoleoutput") {
          let btnPlayground = document.createElement('button');
          btnPlayground.innerHTML = svgPlayground;
          btnPlayground.title = "Открыть в песочнице";
          btnPlayground.classList.add('btn-gray');
          btnPlayground.classList.add('square');
          btnPlayground.classList.add('indent-left');
          btnPlayground.onclick = function(){
            openPlayground(elem_id, lang, false);
          }
          textArea.parentNode.appendChild(btnPlayground);
        }
    }

    return replaceTextAreaWithIde(textArea, lang, is_read_only, elem_id);
}


function replaceTextAreaWithIde(textarea, lang, is_read_only, elem_id) {
  const run_code = (view) => {
    const task_id = view.dom.getAttribute("task_id");
    if (task_id) {
      document.getElementById(btn_run_prefix+task_id).click();
    }
    return true;
  };

  const km = [
    {
      key: "F9",
      run: run_code,
      preventDefault: true
    },
    indentWithTab
  ];

  let extensions = [basicSetup, 
    tabSize.of(EditorState.tabSize.of(4)),
    readOnly.of(EditorState.readOnly.of(is_read_only)),
    editable.of(EditorView.editable.of(!is_read_only)),
    indentUnit.of("    "),
    autocompletion({override: []}),
    // EditorView.lineWrapping,
    keymap.of(km)
  ];

  let updateListenerExtension = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      try {
        const ti = update.view.dom.getAttribute("task_id");
        if (ti) {
          changed_task_id = ti;
        }
        
      } catch (error) {
        console.error("Couldn't handle docChange event in code editor", error);
      }
    }
  });

  extensions.push(updateListenerExtension);

  extensions.push(editorTheme.of(oneDark));
  
  if (lang === "python") {
    extensions.push(python());
  } else if (lang === "rust") {
    extensions.push(rust());
  } else if (lang === "c++" || lang === "cpp") {
    extensions.push(cpp());
  } else if (lang == "go" || lang == "golang") {
    extensions.push(StreamLanguage.define(go))
  } else if (lang == "shell") {
    extensions.push(StreamLanguage.define(shell))
  } else if (lang == "haskell") {
    extensions.push(StreamLanguage.define(haskell))
  }

  if (is_read_only) {
    extensions.push(highlightActiveLine({override: false}));
  }
  
  return editorFromTextArea(textarea, extensions, elem_id);
}


function changeEditorsTheme() {
  for (let [key, value] of CODE_EDITORS) {
    changeEditorTheme(value);
  }

  for (let [key, value] of CODE_EXAMPLES) {
    changeEditorTheme(value);
  }
}

function changeEditorTheme(editor_view) {
  editor_view.dispatch({
    effects: editorTheme.reconfigure(
      is_light ? EditorView.baseTheme() : oneDark
    )
  });
}

function editorFromTextArea(textarea, extensions, elem_id) {
  let view = new EditorView({
    doc: textarea.value.trimEnd(),
    extensions
  });

  textarea.parentNode.insertBefore(view.dom, textarea);
  
  if (elem_id) {
    view.dom.setAttribute('task_id', elem_id);
  }
  textarea.style.display = "none";
  changeEditorTheme(view);
  return view;
}


function md_to_html() {
  var md = window.markdownit();
  var markdownItAttrs = window.markdownItAttrs;
  md.use(markdownItAttrs, {
    // optional, these are default options
    leftDelimiter: '{',
    rightDelimiter: '}',
    allowedAttributes: [],  // empty array = all attributes are allowed
  });
  
  var markdown_div = document.getElementById('markdown-content');
  markdown_div.innerHTML = md.render(markdown_div.textContent);
}

function highlightTask(task_id, statusClass) {
  try {
    var elem = document.getElementById(task_id).parentElement;

    // Highlight border
    elem.classList.remove("TaskNotStarted");
    elem.classList.remove("TaskInProgress");
    elem.classList.remove("TaskCompleted");
    elem.classList.add(statusClass);

    // Add label
    var labels = elem.getElementsByClassName("TaskStatusLabel");
    var label;
    if (labels.length === 0) {
      label = document.createElement('div');
      label.classList.add("TaskStatusLabel");
      elem.appendChild(label);
    } else {
      label = labels[0];
      label.classList.remove("TaskStatusLabelOk");
      label.classList.remove("TaskStatusLabelErr");
    }

    styleTaskStatusLabel(statusClass, label);

    var names = elem.getElementsByClassName("TaskName");
    if (names.length > 0) {
      var n = names[0];
      n.classList.remove("TaskStatusLabelNotStarted");
      n.classList.remove("TaskStatusLabelOk");
      n.classList.remove("TaskStatusLabelErr");
      styleTaskName(statusClass, n);
    }

  } catch (error) {
    console.error("Couldn't highlight task", task_id, error);
  }
}

function update_tasks_progress_bar() {
  if (!is_authorized) {
    return;
  }
  const tasks_completed = document.getElementsByClassName("TaskCompleted").length;
  const tasks_total = tasks_completed + 
                      document.getElementsByClassName("TaskInProgress").length + 
                      document.getElementsByClassName("TaskNotStarted").length;
  
  var width = 100;
  var text = "В этой главе не было задач";

  if (tasks_total > 0) {
    width = tasks_completed / tasks_total * 100.0;
    text ="Решено задач: " + tasks_completed + " из " + tasks_total;
  }

  document.getElementById("barStatus").style.width = width + '%';
  document.getElementById("barStatusText").textContent = text;
}


function tasks_to_code_editors() {
  const user_solutions = JSON.parse(document.getElementById('user_task_solutions').textContent);
  var task_elements = document.getElementsByClassName("task_source");
  
  var task_ids = [];

  for (let task_element of task_elements) {
    task_ids.push(task_element.id);
  }

  for (const task_id of task_ids) {
    var text = "";
    var statusClass = "TaskNotStarted";

    for (const solution of user_solutions) {
      if (solution.hasOwnProperty("task_id")) {
        if (solution.task_id == task_id) {
          text = solution.task_code;

          if (solution.hasOwnProperty("status")) {
            if (solution.status == "completed") {
              statusClass = "TaskCompleted";
            } else if (solution.status == "in_progress") {
              statusClass = "TaskInProgress";
            }
          }
          break;
        }
      }
    }

    DEFAULT_SOLUTIONS.set(task_id, document.getElementById(task_id).textContent);
    CODE_EDITORS.set(task_id, addCodeBlock(task_id, false, text, statusClass));
  }

  update_tasks_progress_bar();
}

function examples_to_readonly_code_editors() {
  var code_elems = document.getElementsByTagName("code");
  var example_ids = [];
  const prefix = "example_";
  var i = 0;

  for (const code_elem of code_elems) {
    let has_lang = false;
    let is_task = false;
    let new_id = "";
    
    for (var j = 0; j < code_elem.classList.length; j++) {
      if (code_elem.classList[j].startsWith('language-')) {
        has_lang = true;
      } else if (code_elem.classList[j].startsWith('task_')) {
        is_task = true;
        break;
      } else if (code_elem.classList[j].startsWith('example_for_playground_')) {
        new_id = code_elem.classList[j];
      }
    }    

    if (has_lang && !is_task) {
      if (new_id.length === 0) {
        new_id = prefix + i.toString();
      }

      code_elem.setAttribute("id", new_id);
      example_ids.push(new_id);
      i = i + 1;
    }
  }

  for (const example_id of example_ids) {
    CODE_EXAMPLES.set(example_id, addCodeBlock(example_id, true));
  }
}

function show_chapter() {
  var chapter_cont = document.getElementById("markdown-content");
  chapter_cont.style.visibility='visible';
}

function add_handler_for_modal_message() {
  window.onclick = function(event) {
    if (event.target.id == modal_overlay_id) {
      event.target.style.display = "none";
    }
  }
}

function closeModal() {
  document.getElementById(modal_overlay_id).style.display = "none";
}

function get_course_url() {
  const s = window.location.href;
  const i = s.indexOf("/courses/");
  if (i === -1) {
    return "";
  }

  const j = s.indexOf("/", i + 10);
  if (j == -1) {
    return "";
  }

  return s.substring(i, j+1);
}


function go_to_practice() {
  window.location.href = SENJUN_URL  + "/courses/" + course_id + "/practice/" + first_unfinished_project_id;
}

function handle_finish_course_response(response) {
  var text = "";

  // User has some unfinished practice projects. We suggest to finish them 
  if (response.hasOwnProperty('unfinished_projects')) {
    course_id = response.course_id;

    unfinished_projects = response.unfinished_projects;
    text += "У вас осталась незавершенной практика:";
    const prefix = "Практика. ";

    for (let i = 0; i < unfinished_projects.length; i++) {
      if (i === 0) {
        first_unfinished_project_id = unfinished_projects[i].project_id;
        text += "<br/><br/>";
      }

      let title = unfinished_projects[i].title;
      if (title.indexOf(prefix) === 0) {
        title = title.substring(prefix.length);
      }


      text += '<div><a href="/courses/' + course_id + '/practice/' + unfinished_projects[i].project_id +'/" target="_self"><i class="fa fa-solid fa-star"></i> ' + title + '</a></div>';

    }
  
    text += '<div class="indent-small">Вы можете выполнить ее либо завершить курс. После завершения курса у вас остается возможность пройти практику и повторно решить задачи.</div>';
    text += '<div class="indent-small"><button class="btn-white" formtarget="_self" onclick="go_to_practice()">Перейти к практике</button><button class="btn-white indent-left-small" formtarget="_self" onclick="finish_course(false)">Завершить курс</button></div>';

    showModal("Незавершенная практика", text);
    return;
  }

  if (response.hasOwnProperty('error_code')) {
        switch (response.error_code) {
          case -1:
            text = "Для продолжения пожалуйста залогиньтесь.";
            break;
          case 1:
            text = "Что-то пошло не так. Пожалуйста, попробуйте позже." + bugreport_text;
            break;
          case 2:
            const courseUrl = get_course_url();
            text = "Чтобы курс считался пройденным, необходимо решить в нем все задачи и прочитать все главы.<br/><br/>Незавершенные задачи и главы можно посмотреть в <a href='" + courseUrl + "' target='_self'>оглавлении курса.</a>";
            break;
          case 4:
            text = "Не удалось пометить курс как пройденный. Пожалуйста, попробуйте позже." + bugreport_text;
            break;
          default:
            text = "Что-то пошло не так. Пожалуйста, попробуйте позже." + bugreport_text;
        }
  } else if (response.hasOwnProperty('course_completed')) {
    window.location.href = SENJUN_URL  + "/courses/" + response.course_id + "/congratulations/";
    return;
  }

  showModal("Ошибка", text);
}

function finish_course(check_practice) {
  if (!is_authorized) {
    window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
    return;
  }
  const token = getCookie(csrftoken_cookie);

  if (token === null) {
    window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
    return;
  }

  const chapter_id = get_chapter_id();

  fetch(SENJUN_URL + "/finish_course/", {
      method: 'POST',
      signal: AbortSignal.timeout(req_timeout_ms),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-CSRFToken': token
      },
      body: JSON.stringify({
        "chapter_id": chapter_id,
        "check_practice": check_practice
      }),
  }).then(response => response.json())
  .then(response => handle_finish_course_response(response))  
  .catch((error) => {
    const err = '<p>Не удалось отправить запрос на сервер для завершения курса. Пожалуйста, повторите попытку позже.</p>' + bugreport_text;
    showModal("Ошибка", err);
    console.error("Exception in finish_course()", error);
  });
}

function getScrollPercent() {
  var h = document.documentElement, 
      b = document.body,
      st = 'scrollTop',
      sh = 'scrollHeight';
  return (h[st]||b[st]) / ((h[sh]||b[sh]) - h.clientHeight) * 100;
}

function add_handler_read_all_chapter() {
  document.addEventListener('scroll', () => {
    if (!is_authorized) {
      return;
    }
    
    const pct = getScrollPercent();
    if (pct > 60) {
        scrolled_to_bottom = true;

        mark_chapter_as_completed();
    }
})
}


function handleFeedbackResult(is_ok, response) {
  del_attachments();
  document.getElementById("feedback_send_progress").classList.add("vis_hid");

  const err = '<p>Что-то пошло не так при отправке фидбэка. Пожалуйста, повторите попытку позже.</p>' + bugreport_text;
  if (!is_ok || !response.hasOwnProperty('status') || response.status !== 0) {
    showModal("Ошибка", err);
    return;
  }

  showModal("Спасибо!", '<p>Ваш фидбэк отправлен команде Senior Junior.</p><p class="indent-small">Для обсуждения проекта вы также можете <a href="https://t.me/senjun_feedback" target="_blank" rel="noopener noreferrer">присоединиться к нашей телеграм-группе.</a></p>');
}

function validateAttachments() {
  const files_input = document.getElementById('feedback_form_files');
  var span = document.getElementById('feedback_form_files_count');
  var btn_del = document.getElementById("del-attachments");

  if (files_input.files.length === 0) {
    span.textContent="";
  }

  if (files_input.files.length > 5) { 
      files_input.value= null;
      btn_del.classList.add("vis_hid");
      showModal("Ошибка", "Количество отправляемых файлов должно быть не больше 5.");
      return;
  }

  for (var i = 0; i < files_input.files.length; i++) { 
      const fsize = files_input.files.item(i).size; 

      if (fsize >= 10000000) { // 10 mb
        btn_del.classList.add("vis_hid");
        files_input.value= null;
        showModal("Ошибка", "Размер одного файла не должен превышать 10 Мб.");
        return;
      }
  }

  if (files_input.files.length === 1) {
    btn_del.classList.remove("vis_hid");
    span.textContent="Выбран 1 файл";
  } else {
    btn_del.classList.remove("vis_hid");
    span.textContent="Выбрано файлов: " + (files_input.files.length).toString();
  }
}

function add_handler_feedback() {
    var form = document.getElementById('feedbackUploadForm');

    form.onsubmit = async (e) => {
          e.preventDefault();

          const text = document.getElementById("feedback_form").value.trim();
          if (text.length === 0) {
              showModal("Ошибка", "Введите пожалуйста текст фидбэка.");
              return;
          }

          if (!is_authorized) {
            const email = document.getElementById("email").value.trim();
            if (email.length === 0) {
              showModal("Ошибка", "Введите пожалуйста e-mail.<br/><br/>Мы вам напишем, если потребуется что-то уточнить или если мы выполним ваше пожелание из фидбэка.");
              return;
            }
          }

          document.getElementById("feedback_send_progress").classList.remove("vis_hid");
          const form = e.currentTarget;
          const url = form.action;

          try {
              var formData = new FormData(form);

              const chapter = document.getElementById("markdown-content").firstChild.textContent;
              formData.append("chapter", chapter);
              formData.append("url", window.location.href);

              const settings = {
                  method: 'POST',
                  body: formData,
                  headers: {
                      'Access-Control-Allow-Origin': '*',
                      'X-CSRFToken': getCookie(csrftoken_cookie)
                  }
              };

              const response = await fetch(url, settings);
              if (response.status !== 200) {
                handleFeedbackResult(false, {});
                return;
              }

              const body = await response.json();
              handleFeedbackResult(true, body);
          } catch (error) {
              console.error(error);
              handleFeedbackResult(false, {});
          }
      }
}

function del_attachments() {
  document.getElementById('feedback_form_files').value = null;
  document.getElementById('feedback_form_files_count').textContent = "";
  document.getElementById("del-attachments").classList.add("vis_hid");
}

function fill_side_menu() {
  var list = document.getElementById("chapter_blocks_list");

  var titles =  document.querySelectorAll('h2,h3')
  for (var i = 0; i < titles.length; i++) {
      var title = titles[i];
      if (!title.id) {
        title.id = "block-"+i;
      }
      var a = document.createElement('a');
      if (title.tagName == "H3" || title.tagName == "h3") {
        a.classList.add("tiny_link");
      }
      var linkText = document.createTextNode(title.textContent);
      a.appendChild(linkText);
      a.title = title.textContent;
      a.href = "#"+title.id;
      a.target = "_self";
      list.appendChild(a);
  }
}

function clear_localstorage_task_presets() {
  try {
  localStorage.removeItem("task_id");
  localStorage.removeItem("task_type");
  localStorage.removeItem("task_needs_type_checking");
  localStorage.removeItem("task_solution");
  }  catch (error) {
    console.error(error);
  }
}

function run_task_if_needed() {
  try {
    const task_id = localStorage.getItem("task_id");
    if (!task_id) {
      return;
    }

    if (!is_authorized) {
      clear_localstorage_task_presets();
      return;
    }

    const task_type = localStorage.getItem("task_type");
    const task_needs_type_checking = localStorage.getItem("task_needs_type_checking") === "true";
    const task_solution = b64DecodeUnicode(localStorage.getItem("task_solution"));
    clear_localstorage_task_presets();

    CODE_EDITORS.get(task_id).dispatch({
      changes: {from: 0, to: CODE_EDITORS.get(task_id).state.doc.length, insert: task_solution}
    });

    document.getElementById(btn_run_prefix+task_id).scrollIntoView();

    runTask(task_id, task_type, task_needs_type_checking);
  } catch (error) {
    console.error(error);
    clear_localstorage_task_presets();
  }
}

function scroll_to_anchor() {
  // Check if the URL contains the anchor id
  const anchor_id = window.location.hash.substring(1);

  const section = document.getElementById(anchor_id);
  if (section) {
    const sectionOffset = section.getBoundingClientRect().top;
    const currentScroll = window.scrollY;

    const duration = 1; // Animation duration in milliseconds
    const startTime = performance.now();
    function scrollAnimation(currentTime) {
      const elapsedTime = currentTime - startTime;
      const scrollProgress = Math.min(elapsedTime / duration, 1);
      const easedProgress = easeOutCubic(scrollProgress);
      const scrollTo = currentScroll + (sectionOffset * easedProgress);
      window.scrollTo(0, scrollTo);
      if (elapsedTime < duration) {
        requestAnimationFrame(scrollAnimation);
      }
    }
    function easeOutCubic(t) {
      return (t - 1) * Math.pow(t, 2) + 1;
    }
    requestAnimationFrame(scrollAnimation);
  }
}

function save_tasks_on_update() {
  // Every n seconds check if there was a user solution update.
  // In case of code update save it to server.
  const n = 2;
   
  setInterval(function() {
      if (!is_authorized) {
        return;
      }

      if (changed_task_id) {
          const cur_contents_str = CODE_EDITORS.get(changed_task_id).state.doc.toString();
          const prev_contents_str = changed_task_texts.get(changed_task_id);
          if (prev_contents_str === cur_contents_str) {
            changed_task_id = null;
            return;
          }

          try {
            saveTask(changed_task_id);
          } catch (error) {
            console.error("Error on background task saving", error);
            // TODO: show alert?
            return;
          }

          changed_task_texts.set(changed_task_id, cur_contents_str);
          changed_task_id = null;
      }
  }, n * 1000 /* ms */ );
}

window.addEventListener('load', function () {
    md_to_html();
    switch_theme_pageload();
    tasks_to_code_editors();

    examples_to_readonly_code_editors();
    show_chapter();

    scroll_to_anchor();

    add_handler_for_modal_message();
    add_handler_read_all_chapter();

    add_handler_feedback();
    fill_side_menu();

    run_task_if_needed();
    save_tasks_on_update();
});