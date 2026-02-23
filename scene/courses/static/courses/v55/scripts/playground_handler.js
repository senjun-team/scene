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

let tabSize = new Compartment;
let readOnly = new Compartment;
let editable = new Compartment;
let editorTheme = new Compartment();
let langConf = new Compartment();

SENJUN_URL = window.location.origin;

var ansi_up = new AnsiUp;

const modal_overlay_id = "modal_overlay";

const server_err_text = 'При обработке кода на сервере что-то пошло не так.';
const network_err_text = 'Не удалось отправить код на сервер.';

const bugreport_text = 'Вы можете сообщить об этой ошибке в нашей&nbsp;<a href="https://t.me/senjun_feedback" target="_blank" rel="noopener noreferrer"> телеграм-группе.</a>';

const req_timeout_ms = 60 * 1000;

const csrftoken_cookie = 'csrftoken';

var onlineIdeEditor = null;
var onlineIdeEditors = [];

var project_contents = null;
var prev_file = null;
var main_file = null;
var number = 0;

var downloadProjectTab = null;

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


function fillConsoleDiv(div_content) {
  document.getElementById("output_container").innerHTML = div_content + "<br/><br/>";
}

function handle_unauthorized() {
  if (!is_authorized) {    
      window.location.href = SENJUN_URL  + "/login/?action=run_code&next=" + window.location.href;
  }
}

function getConsoleOutputCode(response) {
  var output_text = "";
  switch(response.status_code) {
    case 0: // OK
      break;
  
    case 1: // Error while running user code
      break;

    default: // Unexpected error
      output_text += server_err_text;
      output_text += " " + bugreport_text;
      return output_text;
  }

  if (response.hasOwnProperty('user_code_output') &&  response.user_code_output.length > 0) {
    output_text = ansi_up.ansi_to_html(response.user_code_output);
  }

  return output_text;
}

function showRunCodeResult(response) {
  document.getElementById("btn_run").disabled = false;
  const output_text = getConsoleOutputCode(response);
  fillConsoleDiv(output_text);
}

function showModal(title, msgHtml) {
  var modalMsg = document.getElementById(modal_overlay_id);

  modalMsg.innerHTML = '<div class="modal-content"><span class="close" onclick="closeModal()">&times;</span><div class="padding-top-small"><h3 class="title-modal">' + title +'</h3>' + msgHtml + '</div></div>';
  modalMsg.style.display = "block";
}


// Transforms element to code block
function addCodeBlock() {
  const lang_id = document.getElementsByTagName('body')[0].getAttribute("playground_lang_id");
  replaceTextAreaWithIde(lang_id);
}

function getExtensionByLang(lang) {
  if (lang === "python" || lang === "py") {
    return python();
  }
  
  if (lang === "rust" || lang === "rs") {
    return rust();
  } 
  
  if (lang === "c++" || lang === "cpp" || lang === "h" || lang === "hpp") {
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

  return extensions;
}

function editorFromTextArea(textarea, extensions) {
  //onlineIdeEditor = new EditorView({doc: textarea.value, extensions});
  //textarea.parentNode.insertBefore(onlineIdeEditor.dom, textarea);
  //textarea.style.display = "none";
  changePlaygroundEditorTheme(onlineIdeEditor);
}

function replaceTextAreaWithIde(lang) {
  editorFromTextArea(document.getElementById('online_ide'), getExtensions(lang));
}

function changePlaygroundEditorTheme() {
  onlineIdeEditors.forEach(function(elem) {
    elem.dispatch({
      effects: editorTheme.reconfigure(
        is_light ? EditorView.baseTheme() : oneDark
      )
    });
  });
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


async function run_code() {
  handle_unauthorized();

  const form = document.getElementById('runCodeForm');
  const url = form.action;
  const token = getCookie(csrftoken_cookie);

  if (token === null) {
    window.location.href = SENJUN_URL  + "/login/?action=run_code&next=" + window.location.href;
    return;
  }

  try {
      var formData = new FormData(form);

      document.getElementById("btn_run").disabled = true;
      fillConsoleDiv('<div class="div-spinner"><div class="loader"></div><div class="text-loader">Запуск...</div></div>');

      const lang_id = document.getElementsByTagName('body')[0].getAttribute("playground_lang_id");

      if (prev_file) {
        findNode(prev_file, project_contents).contents = onlineIdeEditors[prev_file - 1].state.doc.toString();
      } else {
        findNode(main_file, project_contents).contents = onlineIdeEditors[main_file - 1].state.doc.toString();
      }

      formData.append("project", JSON.stringify(project_contents));
      formData.append("lang_id", lang_id);

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
        document.getElementById("btn_run").disabled = false;
        fillConsoleDiv(network_err_text);
        return;
      }

      const body = await response.json();
      showRunCodeResult(body);
  } catch (error) {
      console.error(error);
      document.getElementById("btn_run").disabled = false;
      fillConsoleDiv(network_err_text);
  }
}

function add_handler_run_code() {
  document.getElementById('runCodeForm').onsubmit = async (e) => {
        e.preventDefault();
        await run_code();
    }
}

function handler_login() {
  window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
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
  const token = getCookie(csrftoken_cookie);
  if (token === null) {
    window.location.href = SENJUN_URL  + "/login/?next=" + window.location.href;
    return;
  }
  playgroundTab = window.open('', '_blank');

  const lang_id = document.getElementsByTagName('body')[0].getAttribute("playground_lang_id");

      if (prev_file) {
        findNode(prev_file, project_contents).contents = onlineIdeEditors[prev_file - 1].state.doc.toString();
      } else {
        findNode(main_file, project_contents).contents = onlineIdeEditors[main_file - 1].state.doc.toString();
      }

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
      "project_name": "senjun_playground_"+lang_id+"_"+dt,
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

function toggle_left_menu() {
  document.getElementById("open_left_menu").classList.toggle("hidden");
  let t = document.getElementById("tree_ul");
  t.classList.toggle("hidden");
}


function getFileExtension(filename) {
  return filename.split('.').pop();
}

function click_on_node(node_id) {

  let node = findNode(node_id, project_contents);

  if (prev_file) {
    onlineIdeEditors[prev_file - 1].dom.setAttribute("style", "display: none !important;");
    findNode(prev_file, project_contents).contents = onlineIdeEditors[prev_file - 1].state.doc.toString();
    document.getElementById(prev_file).classList.remove("selected_file");
  }

  prev_file = node_id;
  document.getElementById(node_id).classList.add("selected_file");

  let langExt = getExtensionByLang(getFileExtension(node.name));

  onlineIdeEditors[node_id - 1].dom.setAttribute("style", "");
  onlineIdeEditors[node_id - 1].dispatch({
    changes: {from: 0, to: onlineIdeEditors[node_id - 1].state.doc.length, insert: node.contents},
    effects: langConf.reconfigure(langExt ? langExt : [])
  });
}

function set_dom_visability(dom, bool)
{
  var style = dom.getAttribute("style");
}

function add_node(cur_node, dom_elem) {
  number += 1;
  cur_node.id = number;

  // MY CODE
  var textarea = document.getElementById('online_ide');
  const lang_id = document.getElementsByTagName('body')[0].getAttribute("playground_lang_id");

  onlineIdeEditors.push(new EditorView({doc: textarea.value, extensions: getExtensions(lang_id)}));
  var editor = onlineIdeEditors[onlineIdeEditors.length - 1];
  editor.dom.setAttribute("style", "display: none !important;")

  textarea.parentNode.insertBefore(editor.dom, textarea);
  textarea.style.display = "none";

  // /MY CODE

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

function create_project_structure() {
  project_contents = JSON.parse(document.getElementById("project_contents_raw").textContent);
  add_node(project_contents, document.getElementById("tree_ul"));
  click_on_node(main_file); // select main project file
}

function handle_keyboard_shortcuts() {
  document.addEventListener('keyup', async function (event) {
    if (event.key === 'F9') {
        await run_code();
    }
  });
}

window.addEventListener('load', function () {
    switch_theme_pageload();
    //addCodeBlock();
    create_project_structure();
    add_project_structure_handler();
    add_handler_run_code();
    add_handler_for_modal_message();
    toggle_left_menu();
    handle_keyboard_shortcuts();
});