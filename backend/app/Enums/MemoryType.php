<?php

namespace App\Enums;

enum MemoryType: string
{
    case Note = 'note';
    case Idea = 'idea';
    case Link = 'link';
    case Voice = 'voice';
}
