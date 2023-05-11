scriptencoding utf-8
" AUTHOR: koturn <jeak.koutan.apple@gmail.com>
" License: This file is placed in the public domain.
let s:save_cpo = &cpo
set cpo&vim

let s:newline_character = "\n"

function! previmglsl#open(preview_html_file) abort " {{{
  let b:previmglsl_opened = 1
  call previmglsl#refresh()
  if exists('g:previmglsl_open_cmd') && !empty(g:previmglsl_open_cmd)
    if has('win32') && g:previmglsl_open_cmd =~? 'firefox'
      " windows+firefox環境
      call s:system(g:previmglsl_open_cmd . ' "file:///'  . fnamemodify(a:preview_html_file, ':p:gs?\\?/?g') . '"')
    elseif has('win32unix')
      call s:system(g:previmglsl_open_cmd . ' '''  . system('cygpath -w ' . a:preview_html_file) . '''')
    elseif get(g:, 'previmglsl_wsl_mode', 0) ==# 1
      let wsl_file_path = system('wslpath -w ' . a:preview_html_file)
      call s:system(g:previmglsl_open_cmd . " 'file:///" . fnamemodify(wsl_file_path, ':gs?\\?\/?') . '''')
    else
      call s:system(g:previmglsl_open_cmd . ' '''  . a:preview_html_file . '''')
    endif
  elseif s:exists_openbrowser()
    let path = a:preview_html_file
    " fix temporary(the cause unknown)
    if has('win32')
      let path = fnamemodify(path, ':p:gs?\\?/?g')
    elseif has('win32unix')
      let path = substitute(path,'\/','','')
    endif
    let path = substitute(path,' ','%20','g')
    call s:apply_openbrowser('file:///' . path)
  else
    call s:echo_err('Command for the open can not be found. show detail :h previmglsl#open')
  endif

  augroup previmglslCleanup
    au!
    au VimLeave * call previmglsl#wipe_cache_for_self()
  augroup END
endfunction " }}}

function! s:exists_openbrowser() abort " {{{
  try
    call openbrowser#load()
    return 1
  catch /E117.*/
    return 0
  endtry
endfunction " }}}

function! s:apply_openbrowser(path) abort " {{{
  let saved_in_vim = g:openbrowser_open_filepath_in_vim
  try
    let g:openbrowser_open_filepath_in_vim = 0
    call openbrowser#open(a:path)
  finally
    let g:openbrowser_open_filepath_in_vim = saved_in_vim
  endtry
endfunction " }}}

function! previmglsl#refresh() abort " {{{
  if exists('b:previmglsl_opened')
    call previmglsl#refresh_js_function()
  endif
endfunction " }}}

function! s:copy_file(src, dest) abort " {{{
  try
    call writefile(readfile(a:src, 'b'), a:dest, 'b')
    return 1
  catch
    return 0
  endtry
endfunction " }}}

" TODO: test(refresh_cssと同じように)
function! previmglsl#refresh_js_function() abort " {{{
  let encoded_lines = split(iconv(s:function_template(), &encoding, 'utf-8'), s:newline_character)
  call writefile(encoded_lines, previmglsl#make_preview_file_path('js/content.js'))
endfunction " }}}

let s:base_dir = fnamemodify(expand('<sfile>:p:h') . '/../preview', ':p')

if exists('g:previm_custom_preview_base_dir')
  let s:preview_base_dir = expand(g:previm_custom_preview_base_dir)
else
  let s:preview_base_dir = s:base_dir
endif

if s:preview_base_dir !~# '/$'
  let s:preview_base_dir .= '/'
endif

function! previmglsl#preview_base_dir() abort " {{{
  return s:preview_base_dir
endfunction " }}}

function! s:preview_directory() abort " {{{
  return s:preview_base_dir . sha256(expand('%:p'))[:15] . '-' . getpid()
endfunction " }}}

function! previmglsl#make_preview_file_path(path) abort " {{{
  let src = s:base_dir . '/_/' . a:path
  let dst = s:preview_directory() . '/' . a:path
  if !filereadable(dst)
    let dir = fnamemodify(dst, ':p:h')
	if !isdirectory(dir)
      call mkdir(dir, 'p')
    endif

    if filereadable(src)
      call s:copy_file(src, dst)
    endif
  endif
  return dst
endfunction " }}}

function! previmglsl#cleanup_preview(dir) abort " {{{
  call delete(a:dir, 'rf')
endfunction " }}}

" NOTE: getFileType()の必要性について。
" js側でファイル名の拡張子から取得すればこの関数は不要だが、
" その場合「.txtだが内部的なファイルタイプがmarkdown」といった場合に動かなくなる。
" そのためVim側できちんとファイルタイプを返すようにしている。
function! s:function_template() abort " {{{
  let current_file = expand('%:p')
  return join([
        \ 'function getFileName() {',
        \ printf('  return "%s";', s:escape_backslash(current_file)),
        \ '}',
        \ '',
        \ 'function getFileType() {',
        \ printf('  return "%s";', &filetype),
        \ '}',
        \ '',
        \ 'function getLastModified() {',
        \ printf('  return "%s";', s:get_last_modified_time()),
        \ '}',
        \ '',
        \ 'function getContent() {',
        \ printf('  return "%s";', previmglsl#convert_to_content(getline(1, '$'))),
        \ '}',
        \ 'function getOptions() {',
        \ printf('  return %s;', previmglsl#options()),
        \ '}',
        \], s:newline_character)
endfunction " }}}

function! s:get_last_modified_time() abort " {{{
  if exists('*strftime')
    return strftime('%Y/%m/%d (%a) %H:%M:%S')
  endif
  return '(strftime cannot be performed.)'
endfunction " }}}

function! s:escape_backslash(text) abort " {{{
  return escape(a:text, '\')
endfunction " }}}

function! s:system(cmd) abort " {{{
  if get(g:, 'previmglsl_disable_vimproc', 0)
    return system(a:cmd)
  endif

  try
    " NOTE: WindowsでDOS窓を開かず実行してくれるらしいのでvimprocを使う
    let result = vimproc#system(a:cmd)
    return result
  catch /E117.*/
    return system(a:cmd)
  endtry
endfunction " }}}

function! previmglsl#convert_to_content(lines) abort " {{{
  let mkd_dir = s:escape_backslash(expand('%:p:h'))
  if has('win32unix')
    " convert cygwin path to windows path
    let mkd_dir = substitute(system('cygpath -wa ' . mkd_dir), "\n$", '', '')
    let mkd_dir = substitute(mkd_dir, '\', '/', 'g')
  elseif get(g:, 'previmglsl_wsl_mode', 0) ==# 1
    let mkd_dir = trim(system('wslpath -w ' . mkd_dir))
    let mkd_dir = substitute(mkd_dir, '\', '/', 'g')
  elseif has('win32')
    let mkd_dir = substitute(mkd_dir, '\', '/', 'g')
  endif
  let converted_lines = []
  for line in a:lines
    " TODO エスケープの理由と順番の依存度が複雑
    let escaped = substitute(line, '\', '\\\\', 'g')
    let escaped = substitute(escaped, '"', '\\"', 'g')
    let escaped = substitute(escaped, '\r', '\\r', 'g')
    call add(converted_lines, escaped)
  endfor
  return join(converted_lines, "\\n")
endfunction " }}}

function! s:echo_err(msg) abort " {{{
  echohl WarningMsg
  echomsg a:msg
  echohl None
endfunction " }}}

function! previmglsl#wipe_cache() abort " {{{
  for path in filter(split(globpath(s:preview_base_dir, '*'), "\n"), 'isdirectory(v:val) && v:val !~ "_$"')
    call previmglsl#cleanup_preview(path)
  endfor
endfunction " }}}

function! previmglsl#wipe_cache_for_self() abort " {{{
  for path in filter(split(globpath(s:preview_base_dir, '*'), "\n"), 'isdirectory(v:val) && v:val !~ "_$"')
    if path =~# '-' .. getpid() .. '$'
      call previmglsl#cleanup_preview(path)
    endif
  endfor
endfunction " }}}

function! previmglsl#options() abort " {{{
  if !exists('*json_encode')
    return '{}'
  endif
  return json_encode({
  \   'autoClose': get(g:, 'previmglsl_auto_close', 0),
  \ })
endfunction " }}}

let &cpo = s:save_cpo
unlet! s:save_cpo
