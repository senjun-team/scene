SENJUN_URL = window.location.origin;

modal_overlay_id = "modal_overlay";

var is_light = true; // light or dark

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

function copyCodeToClipboard() {
  var copyText = document.getElementById("tg_bot_key_val");
  navigator.clipboard.writeText(copyText.textContent);
}

function switch_tab(btn) {
  let elements = document.getElementsByClassName("btn-tab");

  for (let i = 0; i < elements.length; i++) {
    if (elements[i].id !== btn.id)
      elements[i].disabled = false;
      document.getElementById("tab_"+elements[i].id).classList.add('vis_hid');
  }

  btn.disabled = true;
  document.getElementById("tab_"+btn.id).classList.remove('vis_hid');
}

function handle_generate_tg_bot_key_response(response) {
    if (!response.hasOwnProperty('key')) {
      return;
    }
   
    const key = response.key;
    d = document.getElementById("tg_bot_key");
    d.innerHTML =
    '<div class="task_text">'+
    '<p class="text-about">В telegram-боте введите команду и код для синхронизации:</p>'+
    '<p class="primary"><span id="tg_bot_key_val">/sync ' + key + '</span><i class="fa fa-solid fa-copy icon-copy" onclick="copyCodeToClipboard()"></i></p>'+
    '<p class="text-about">Код будет действителен в течение суток.</p>'
    '</div>';
}

   
function handle_tg_bot_unsync_response(response) {
  if (!response.hasOwnProperty('status')) {
    return;
  }

  if (response.status == 0) {
    window.location.href = SENJUN_URL + "/user/";
  } 
}

function handle_sync_bot() {
  fetch(SENJUN_URL + "/generate_tg_bot_key/", {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-CSRFToken': getCookie('csrftoken')
      },
  }).then(response => response.json())
  .then(response => handle_generate_tg_bot_key_response(response));
}

function handle_unsync_bot() {
  fetch(SENJUN_URL + "/delete_tg_bot_link/", {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-CSRFToken': getCookie('csrftoken')
      },
  }).then(response => response.json())
  .then(response => handle_tg_bot_unsync_response(response));
}

function add_handler_for_btn_sync_acc_bot() {
  var btn = document.getElementById("btn-sync-acc-bot");
  if (!btn) {
    return;
  }

  btn.onclick = function(){
    handle_sync_bot();
  }
}

function closeModalWindow() {
  var modalMsg = document.getElementById(modal_overlay_id);
  modalMsg.innerHTML = '';
  modalMsg.style.display = "none";
}

function add_handler_for_btn_del_acc_bot() {
  var btn = document.getElementById("btn-sync-acc-bot-remove");
  if (!btn) {
    return;
  }

  btn.onclick = function(){
    handle_unsync_bot();
  }
}

function add_hanlder_dropdown_click() {
  window.onclick = function(event) {
    if (!event.target.matches('.dropbtn')) {
      var dropdowns = document.getElementsByClassName("dropdown-content");
      var i;
      for (i = 0; i < dropdowns.length; i++) {
        var openDropdown = dropdowns[i];
        if (openDropdown.classList.contains('show')) {
          openDropdown.classList.remove('show');
        }
      }

      if (event.target.id == modal_overlay_id) {
        event.target.style.display = "none";
      }
    }
  }
}

function add_handler_register_status() {
  const queryString = window.location.search;
  let urlParams = new URLSearchParams(queryString);

  const status = urlParams.get('status');
  var msgHtml = "";

  if (status) {
      urlParams.delete('status');

      if (status === "registered") {
          const email = urlParams.get('email');
          if (email) {
              urlParams.delete('email');
              msgHtml = 'Для завершения регистрации перейдите по ссылке из письма, отправленного на ' + email + '.<br><br>Обязательно проверьте, не попало ли письмо в спам!';
          }
      } else if (status === "confirmed") {
        msgHtml = 'Ваша регистрация успешно подтверждена. Теперь вы можете залогиниться.';
      } else if (status === "reg_err") {
        msgHtml = 'Ссылка для активации устарела или является некорректной.';
      }

      var modalMsg = document.getElementById(modal_overlay_id);
      modalMsg.innerHTML = '<div class="modal-content"><span class="close" onclick="closeModalWindow()">&times;</span><div class="padding-top-small">' + msgHtml + '</div></div>';
      modalMsg.style.display = "block";
      history.replaceState(null, null, "?" + urlParams.toString());
  }
}

function switch_theme(theme_str) {
  is_light = theme_str === "light";
  document.documentElement.setAttribute('data-theme', theme_str);
  replace_icon_colors();
  change_theme_switcher_button_icon();
}

function switch_theme_pageload() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    const theme = event.matches ? "dark" : "light";
    switch_theme(theme);
  });

  // Try to get theme from localStorage
  let theme = localStorage.getItem("theme");
  if (theme) {
    if (theme !== "dark" && theme !== "light") {
      return;
    }

    switch_theme(theme);
    return;
  }

  // Try to get browser theme
  if (window.matchMedia) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
    localStorage.setItem("theme", theme);
    switch_theme(theme);
  }
}

function switch_theme_click() {
  is_light = !is_light;
  const theme = is_light ? "light" : "dark";
  switch_theme(theme);

  try { 
    localStorage.setItem("theme", theme);
  } catch (error) {
    console.error(error);
  }

  try {
    changeEditorsTheme();
  } catch(error) {
    // Do nothing: on some pages we don't have script with this function
  }

  try {
    changePlaygroundEditorTheme();
  } catch(error) {
    // Do nothing: on some pages we don't have script with this function
  }
}

function search_click() {
  var modalMsg = document.getElementById(modal_overlay_id);

  modalMsg.innerHTML = '<div class="modal-content"><span class="close" onclick="closeModalWindow()">&times;</span><div class="padding-top-small">' 
+ '<input type="search" name="q" size="20" maxlength="300" class="indent-left-small indent-small" autofocus id="search_input">'
+ '<button class="btn-white indent-left-small indent-small" onclick="search()">Искать</button>'
+ '</div></div>';
  modalMsg.style.display = "block";

  let input = document.getElementById('search_input');
  input.focus();

  input.addEventListener("keyup", function(event) {
      if (event.key === "Enter") {
          search();
      }
  });
}

function search() {
  const user_query = document.getElementById('search_input').value;
  if (user_query.length < 2)
    return;

  window.open("https://www.google.com/search?q=site:senjun.ru " + encodeURIComponent(user_query), '_blank').focus();
}

function replace_icon_colors() {
  let items = document.getElementsByClassName("svg-item");
  let color = is_light ? "#4054a3" : "#b8d8fc";

  for (var i = 0; i < items.length; i++) {
    try {
        var inner_items = items[i].getSVGDocument().getElementsByClassName("svg-internal");
        for (var j = 0; j < inner_items.length; j++) {
          inner_items[j].setAttribute("fill", color);
          if (inner_items[j].getAttribute("stroke")) {
            inner_items[j].setAttribute("stroke", color);
          }
        }
    } catch (error) {
      //console.error("Couldn't replace icon color:", error);
    }
  }
}

function change_theme_switcher_button_icon() {
  var btn = document.getElementById("theme_switch_btn");
  const class_light = "fa-moon-o";
  const class_dark = "fa-sun-o";

  if (is_light) {
    btn.classList.add(class_light);
    btn.classList.remove(class_dark);
  } else {
    btn.classList.remove(class_light);
    btn.classList.add(class_dark);
  }
}

function on_click_chapter_with_subchapters(mainChapter) {
  var container = mainChapter.parentElement;
  var subChapters = container.querySelectorAll("div[class=chapters-list-div]"); 
  var rotateMe = container.querySelectorAll("i")[0];
  var firstSubChapter = subChapters[0];
  var displayCurrent = firstSubChapter.style.getPropertyValue("display");
  var displayNew = displayCurrent == "none" ? "flex" : "none";
  var transformNew = displayCurrent == "none" ? "rotate(90deg)" : "rotate(0deg)";

  subChapters.forEach(function(elem) {
    elem.style.setProperty("display", displayNew);
  });
  rotateMe.style.setProperty("transform", transformNew);
}

window.addEventListener('load', function () {
  switch_theme_pageload();
  add_handler_for_btn_sync_acc_bot();
  add_handler_for_btn_del_acc_bot();
  add_hanlder_dropdown_click();
  add_handler_register_status();
});