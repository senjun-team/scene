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

let tabSize = new Compartment;
let readOnly = new Compartment;
let editable = new Compartment;
let editorTheme = new Compartment();
let langConf = new Compartment();

const is_authorized = document.getElementById("login-register") == null;
var tasks_completed = 0;

SENJUN_URL = window.location.origin;

var ansi_up = new AnsiUp;

const server_err_text = 'При обработке кода на сервере что-то пошло не так.';
const network_err_text = 'Не удалось отправить код на сервер.';

const tests_err_text = 'Тесты не пройдены.';

const bugreport_text = 'Вы можете сообщить об этой ошибке в нашей&nbsp;<a href="https://t.me/senjun_feedback" target="_blank" rel="noopener noreferrer"> телеграм-группе.</a>';

const req_timeout_ms = 60 * 1000;

const csrftoken_cookie = 'csrftoken';

var onlineIdeEditor = null;

var project_contents = null;
var prev_file = null;
var main_file = null;
var number = 0;

var is_doc_changed = false;
var prev_project_contents_str = "";

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


function replace_md_with_html(elem_id, md) {
    var elem = document.getElementById(elem_id);
    elem.innerHTML = md.render(elem.textContent);
    elem.classList.remove("hidden");
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
    
    replace_md_with_html('markdown-content', md);
    replace_md_with_html('hint_text', md);
  }


function findNode(id, currentNode) {
    let i,
        currentChild,
        result;
  
    if (id == parseInt(currentNode.id)) {
        return currentNode;
    } else {
        if (currentNode.hasOwnProperty('children')) {
          // Use a for loop instead of forEach to avoid nested functions
          // Otherwise "return" will not work properly
          for (i = 0; i < currentNode.children.length; i += 1) {
            currentChild = currentNode.children[i];
  
            // Search in the current child
            result = findNode(id, currentChild);
  
            // Return the result if the node has been found
            if (result !== false) {
                return result;
            }
            }
        }
  
  
        // The node has not been found and we have no more options
        return false;
    }
  }

  function getExtensionByLang(lang) {
    if (lang === "python" || lang === "py") {
      return python();
    }
    
    if (lang === "rust" || lang === "rs") {
      return rust();
    } 
    
    if (lang === "c++" || lang === "cpp" || lang === "h" || lang === "hpp" || lang === "cppm") {
      return cpp();
    }
    
    if (lang === "go" || lang === "golang") {
      return StreamLanguage.define(go);
    }
    
    if (lang === "shell" || lang === "sh") {
      return StreamLanguage.define(shell);
    }
      
    if (lang === "haskell" || lang === "hs") {
      return StreamLanguage.define(haskell);
    }
  
    return null;
  }

  function getExtensions(lang) {
    let extensions = [basicSetup, 
      tabSize.of(EditorState.tabSize.of(4)),
      indentUnit.of("    "),
      autocompletion({override: []}),
      EditorView.lineWrapping,
      keymap.of([indentWithTab]),
    ];
  
    extensions.push(editorTheme.of(oneDark));
    extensions.push(langConf.of(getExtensionByLang(lang)));

    let updateListenerExtension = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        is_doc_changed = true;
      }
    });
  
    extensions.push(updateListenerExtension);
    return extensions;
  }
  
  function editorFromTextArea(textarea, extensions) {
    onlineIdeEditor = new EditorView({doc: textarea.value, extensions});
    textarea.parentNode.insertBefore(onlineIdeEditor.dom, textarea);
    textarea.style.display = "none";
    changePlaygroundEditorTheme(onlineIdeEditor);
  }
  
  function replaceTextAreaWithIde(lang) {
    editorFromTextArea(document.getElementById('online_ide'), getExtensions(lang));
  }

  function changePlaygroundEditorTheme() {
    onlineIdeEditor.dispatch({
      effects: editorTheme.reconfigure(
        is_light ? EditorView.baseTheme() : oneDark
      )
    });
  }

  function toggle_left_menu() {
    document.getElementById("open_left_menu").classList.toggle("hidden");
    document.getElementById("tree_ul").classList.toggle("hidden");
  }
  
  
  function getFileExtension(filename) {
    return filename.split('.').pop();
  }
  
  function click_on_node(node_id) {
    let node = findNode(node_id, project_contents);
  
    if (prev_file) {
      findNode(prev_file, project_contents).contents = onlineIdeEditor.state.doc.toString();
      document.getElementById(prev_file).classList.remove("selected_file");
    }
  
    prev_file = node_id;
    document.getElementById(node_id).classList.add("selected_file");
    
    let langExt = getExtensionByLang(getFileExtension(node.name));
  
    onlineIdeEditor.dispatch({
      changes: {from: 0, to: onlineIdeEditor.state.doc.length, insert: node.contents},
      effects: langConf.reconfigure(langExt ? langExt : [])
    });
  }
  
  
  function add_node(cur_node, dom_elem) {
    number += 1;
    cur_node.id = number;
  
    if (cur_node.hasOwnProperty('contents')) {
      const s = cur_node.contents; // b64DecodeUnicode(cur_node.contents);
      cur_node.contents =  s;
      let leaf = document.createElement('li');
      leaf.innerHTML=cur_node.name;
      leaf.id = number;
  
      leaf.onclick = function(event) {
        click_on_node(event.target.id);
      };
  
      dom_elem.appendChild(leaf);
  
      if (cur_node.hasOwnProperty('is_main_file')) {
        main_file = number;
      }
      return;
    }
  
    if (cur_node.hasOwnProperty('children')) {
      let node = document.createElement('li');
      let span = document.createElement('span');
      span.classList.add("caret");
      span.innerText = cur_node.name;
      node.appendChild(span);
  
      if (number == 1) { // project root
        let span_close = document.createElement('span');
        span_close.innerHTML = '<i class="fa fa-solid fa-close"></i>'; // "&times;";
        span_close.classList.add("closebtn");
        span_close.id = "toggle_tree_btn";
        span_close.setAttribute("title", "Скрыть структуру проекта");
  
        span_close.onclick = function() {
          toggle_left_menu();
        };
  
        node.appendChild(span_close);
      }
  
      let ul = document.createElement('ul');
      ul.classList.add("nested");
      ul.classList.add("active"); // expand node
      node.appendChild(ul);
      dom_elem.appendChild(node);
  
      for (const child of cur_node.children) {
        add_node(child, ul);
      }
    }
  }
  
  function create_project_structure(project_contents_raw) {
    project_contents = JSON.parse(project_contents_raw);
    add_node(project_contents, document.getElementById("tree_ul"));
    click_on_node(main_file); // select main project file

    add_project_structure_handler();
  }

  function add_project_structure_handler() {
    var toggler = document.getElementsByClassName("caret");
    var i;
  
    for (i = 0; i < toggler.length; i++) {
      toggler[i].addEventListener("click", function() {
        this.parentElement.querySelector(".nested").classList.toggle("active");
        this.classList.toggle("caret-down");
      });
    }
  }
  
  function getFileExtension(filename) {
    return filename.split('.').pop();
  }


// Transforms element to code block
function add_code_block() {
    const lang_id = document.getElementsByTagName('body')[0].getAttribute("course_id");
    replaceTextAreaWithIde(lang_id);
}

function update_tasks_progress_bar() {
  if (!is_authorized) {
    return;
  }

  const tasks_total = 1;
  
  const width = tasks_completed / tasks_total * 100.0;
  const text ="Решено задач: " + tasks_completed + " из " + tasks_total;
  document.getElementById("barStatus").style.width = width + '%';
  document.getElementById("barStatusText").textContent = text;
}


function handle_unauthorized() {
    if (!is_authorized) {    
        window.location.href = SENJUN_URL  + "/login/?action=run_practice_code&next=" + window.location.href;
    }
}

function fillConsoleDiv(div_content) {
    document.getElementById("output_container").innerHTML = div_content + "<br/><br/>";
  }
  
  
  function getConsoleOutputCode(response) {
    var output_text = "";
    switch(response.status_code) { // 0 = ok, 1 = err running code, 2 = didn't pass tests, other = unexpected
      case 0: // OK
        break;
    
      case 1: // Error while running user code
        break;
      
      case 2:
        output_text += tests_err_text + '<br/>';
        break;
  
      default: // Unexpected error
        output_text += server_err_text;
        output_text += " " + bugreport_text;
        return output_text;
    }

    if (response.hasOwnProperty('user_code_output') &&  response.user_code_output.length > 0) {
      output_text += ansi_up.ansi_to_html(response.user_code_output)  + '<br/>';
    }

    if (response.hasOwnProperty('tests_output') && response.tests_output.length > 0) {
        output_text += ansi_up.ansi_to_html(response.tests_output) + '<br/>';
    }

    return output_text;
  }
  

function showRunTaskResult(action, response) {
    const output_text = getConsoleOutputCode(response);
    after_api_call(output_text, action);

    if (action !== "test") {
        return;
    }

    tasks_completed = (response.status_code === 0) ? 1 : 0;
    update_tasks_progress_bar();

    if (response.status_code === 0) {
      document.getElementById("modal_overlay_complete").style.display = "block";
    }
}

function before_api_call() {
    document.getElementById("btn_run").disabled = true;
    document.getElementById("btn_test").disabled = true;
    document.getElementById("btn_reset").disabled = true;
    fillConsoleDiv('<div class="div-spinner"><div class="loader"></div><div class="text-loader">Запуск...</div></div>');
}

function after_api_call(console_text, action) {
    fillConsoleDiv(console_text);
    if (action !== "save") {
        document.getElementById("output_container").scrollIntoView();
    }
    document.getElementById("btn_run").disabled = false;
    document.getElementById("btn_test").disabled = false;
    document.getElementById("btn_reset").disabled = false;
}

function update_project_state() {
  if (prev_file) {
    findNode(prev_file, project_contents).contents = onlineIdeEditor.state.doc.toString();
  } else {
    findNode(main_file, project_contents).contents = onlineIdeEditor.state.doc.toString();
  }
}

function handle_project(action, is_background=false) {
    // TODO: do it better?
    if (!is_authorized && is_background) {
      return;
    }

    handle_unauthorized();
    const token = getCookie(csrftoken_cookie);

    if (token === null) {
      if (is_background) {
        // TODO: do it better?
        return;
      } else {
        window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
      }
    }

    if (action !== "save") {
      before_api_call();
    }

    try {
      const course_id = document.getElementsByTagName('body')[0].getAttribute("course_id");
      const project_id = document.getElementById("markdown-content").getAttribute("project_id");
      const cmd_line_args = document.getElementById("cmd_line_args").value;
      if (!is_background) {
        update_project_state();
      }

      fetch(SENJUN_URL+"/handle_practice_code/", {
          method: 'POST',
          signal: AbortSignal.timeout(req_timeout_ms),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-CSRFToken': token
          },
          body: JSON.stringify({
            "project_contents": JSON.stringify(project_contents),
            "project_id": project_id,
            "course_id": course_id,
            "action": action,
            "user_cmd_line_args": cmd_line_args
          }),
      }).then(response => response.json())
      .then(response => showRunTaskResult(action, response))
      .catch((error) => {
        console.error(error);
        after_api_call(network_err_text, action);
      });

  } catch (error) {
      console.error(error);
      after_api_call(network_err_text, action);
  }
}

function close_modal() {
    document.getElementById("modal_overlay").style.display = "none";
}

function show_hint() {
    document.getElementById("modal_overlay").style.display = "block";
}


function close_modal_reset() {
    document.getElementById("modal_overlay_reset").style.display = "none";
}

function close_modal_complete() {
  document.getElementById("modal_overlay_complete").style.display = "none";
}

function reset_solution() {
    document.getElementById("modal_overlay_reset").style.display = "block";
}

function reset_project_contents() {
    document.getElementById("tree_ul").innerHTML = '';
    number = 0;
    prev_file = null;
    create_project_structure(document.getElementById("project_contents_raw_default").textContent);
    close_modal_reset();

    try {
        handle_project("save");
    } catch (error) {
        console.error("Error on reset_project_contents while saving project", error);
    }
}


function handle_keyboard_shortcuts() {
  document.addEventListener('keyup', async function (event) {
    if (event.key === 'F9') {
        handle_project("run");
    }
  });
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
      fillConsoleDiv("Ошибка при отправке фидбэка. Количество отправляемых файлов должно быть не больше 5.");
      document.getElementById("output_container").scrollIntoView();
      return;
  }

  for (var i = 0; i < files_input.files.length; i++) { 
      const fsize = files_input.files.item(i).size; 

      if (fsize >= 10000000) { // 10 mb
        btn_del.classList.add("vis_hid");
        files_input.value= null;
        fillConsoleDiv("Ошибка при отправке фидбэка. Размер одного файла не должен превышать 10 Мб.");
        document.getElementById("output_container").scrollIntoView();
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

function handleFeedbackResult(is_ok, response) {
  del_attachments();
  document.getElementById("feedback_send_progress").classList.add("vis_hid");

  const err = '<p>Что-то пошло не так при отправке фидбэка. Пожалуйста, повторите попытку позже.</p>' + bugreport_text;
  if (!is_ok || !response.hasOwnProperty('status') || response.status !== 0) {
    fillConsoleDiv("Ошибка: " + err);
    document.getElementById("output_container").scrollIntoView();
    return;
  }

  fillConsoleDiv("Спасибо! " + '<p>Ваш фидбэк отправлен команде Senior Junior.</p><p class="indent-small">Для обсуждения проекта вы также можете <a href="https://t.me/senjun_feedback" target="_blank" rel="noopener noreferrer">присоединиться к нашей телеграм-группе.</a></p>');
  document.getElementById("output_container").scrollIntoView();
}

function add_handler_feedback() {
    var form = document.getElementById('feedbackUploadForm');

    form.onsubmit = async (e) => {
          e.preventDefault();

          const text = document.getElementById("feedback_form").value.trim();
          if (text.length === 0) {
            fillConsoleDiv("Ошибка. Введите пожалуйста текст фидбэка.");
            document.getElementById("output_container").scrollIntoView();
              return;
          }

          if (!is_authorized) {
            const email = document.getElementById("email").value.trim();
            if (email.length === 0) {
              fillConsoleDiv("Введите пожалуйста e-mail.<br/><br/>Мы вам напишем, если потребуется что-то уточнить или если мы выполним ваше пожелание из фидбэка.");
              document.getElementById("output_container").scrollIntoView();
              return;
            }
          }

          document.getElementById("feedback_send_progress").classList.remove("vis_hid");
          const form = e.currentTarget;
          const url = form.action;

          try {
              const token = getCookie(csrftoken_cookie);

              if (token === null) {
                window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
              }

              var formData = new FormData(form);

              const chapter = document.getElementById("markdown-content").firstChild.textContent;
              formData.append("chapter", chapter);
              formData.append("url", window.location.href);

              const settings = {
                  method: 'POST',
                  body: formData,
                  headers: {
                      'Access-Control-Allow-Origin': '*',
                      'X-CSRFToken': token
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

function handle_download_project(response) {
  if (response.status_code == 0) {
    playgroundTab.location.href = SENJUN_URL  + response.url;
    return;
  }

  if (playgroundTab) {
    playgroundTab.close();
  }
}

function download_project() {
  handle_unauthorized();
  const token = getCookie(csrftoken_cookie);

  if (token === null) {
    window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
  }

  playgroundTab = window.open('', '_blank');

  const project_id = document.getElementById("markdown-content").getAttribute("project_id");
  const lang_id = document.getElementsByTagName('body')[0].getAttribute("course_id");
  
  update_project_state();

  let d = new Date(); 
  let dt = d.getDate() + "_"
                + (d.getMonth()+1)  + "_" 
                + d.getFullYear() + "_"  
                + d.getHours() + "_"  
                + d.getMinutes() + "_" 
                + d.getSeconds();

  fetch(SENJUN_URL+"/download_project/", {
    method: 'POST',
    signal: AbortSignal.timeout(req_timeout_ms),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-CSRFToken': token
    },
    body: JSON.stringify({
      "project_contents": JSON.stringify(project_contents),
      "lang_id": lang_id,
      "project_name": "senjun_practice_"+project_id+"_"+dt,
    }),
}).then(response => response.json())
.then(response => handle_download_project(response))
.catch((error) => {
  console.error(error);
  if (playgroundTab) {
    playgroundTab.close();
  }
});
}

function save_project_on_update() {
  // Every n seconds check if there was a user solution update.
  // In case of code update save it to server.
  const n = 2;
   
  setInterval(function() {
    if (!is_authorized) {
      return;
    }

    if (is_doc_changed) {
        update_project_state();
        const cur_project_contents_str = JSON.stringify(project_contents);

        // Fist run
        if (prev_project_contents_str === "") {
          prev_project_contents_str = cur_project_contents_str;
        }

        if (prev_project_contents_str === cur_project_contents_str) {
          is_doc_changed = false;
          return;
        }

        try {
          handle_project("save", true);
        } catch (error) {
          console.error("Error on background project saving", error);
          // TODO: show alert?
          return;
        }

        prev_project_contents_str = cur_project_contents_str;
        is_doc_changed = false;
        // console.log("Saved user solution in background");
    }

  }, n * 1000 /* ms */ );
}

window.addEventListener('load', function () {
    md_to_html();
    switch_theme_pageload();
    add_code_block();
    create_project_structure(document.getElementById("project_contents_raw").textContent);
    
    const status = document.getElementsByTagName('body')[0].getAttribute("status");
    tasks_completed = (status === "completed") ? 1 : 0;

    update_tasks_progress_bar();
    handle_keyboard_shortcuts();
    add_handler_feedback();
    save_project_on_update();
});
