<?php
/*
 * Fejlesztői teszt-IdP (SimpleSAMLphp) felhasználói.
 * Az attribútumneveket az eduID.hu föderációhoz hasonlóan urn:oid formában adjuk át.
 * CSAK HELYI FEJLESZTÉSHEZ – a jelszavak szándékosan egyszerűek.
 */
$eppn = 'urn:oid:1.3.6.1.4.1.5923.1.1.1.6';
$mail = 'urn:oid:0.9.2342.19200300.100.1.3';
$displayName = 'urn:oid:2.16.840.1.113730.3.1.241';
$affiliation = 'urn:oid:1.3.6.1.4.1.5923.1.1.1.9';

$config = array(
    'admin' => array(
        'core:AdminPassword',
    ),

    'example-userpass' => array(
        'exampleauth:UserPass',
        'hallgato1:password' => array(
            $eppn => 'kovacs.reka@nye.hu',
            $mail => 'kovacs.reka@student.nye.hu',
            $displayName => 'Kovács Réka',
            $affiliation => array('student@nye.hu', 'member@nye.hu'),
        ),
        'hallgato2:password' => array(
            $eppn => 'nagy.bence@nye.hu',
            $mail => 'nagy.bence@student.nye.hu',
            $displayName => 'Nagy Bence',
            $affiliation => array('student@nye.hu', 'member@nye.hu'),
        ),
        'admin1:password' => array(
            $eppn => 'szabo.marta@nye.hu',
            $mail => 'szabo.marta@nye.hu',
            $displayName => 'Szabó Márta',
            $affiliation => array('staff@nye.hu', 'member@nye.hu'),
        ),
        // Más intézmény felhasználója: a StudyRoom elutasítja (ALLOWED_SCOPES).
        'kulsos:password' => array(
            $eppn => 'kiss.anna@elte.hu',
            $mail => 'kiss.anna@elte.hu',
            $displayName => 'Kiss Anna',
            $affiliation => array('student@elte.hu'),
        ),
    ),
);
