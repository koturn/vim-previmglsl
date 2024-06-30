" AUTHOR: koturn <jeak.koutan.apple@gmail.com>
" License: This file is placed in the public domain.

if exists('g:loaded_previmglsl') && g:loaded_previmglsl
  finish
endif
let g:loaded_previmglsl = 1

let s:save_cpo = &cpo
set cpo&vim


augroup PrevimGlsl
  autocmd! * <buffer>
  if get(g:, 'previmglsl_enable_realtime', 0) ==# 1
    " NOTE: It is too frequently in TextChanged/TextChangedI
    autocmd CursorHold,CursorHoldI,InsertLeave,BufWritePost * call previmglsl#refresh()
  else
    autocmd BufWritePost * call previmglsl#refresh()
  endif
augroup END

command! -nargs=* -complete=customlist,previmglsl#compl_parser PrevimGlslOpen
      \ call previmglsl#open(previmglsl#make_preview_file_path('index.html'), previmglsl#parse_args(<q-args>))
command! -nargs=0 PrevimGlslWipeCache call previmglsl#wipe_cache()
command! -nargs=0 PrevimGlslRefresh call previmglsl#refresh()


let &cpo = s:save_cpo
unlet! s:save_cpo
